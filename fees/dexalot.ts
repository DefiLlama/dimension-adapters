import ADDRESSES from '../helpers/coreAssets.json'
import { ethers } from "ethers";
import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const TRADE_PAIRS = "0x09383137c1eee3e1a8bc781228e4199f6b4a9bbf";
const PORTFOLIO_SUB = "0xa5c079c1986e2335d83fa2d7282e162958e515d5";
const FEE_COLLECTOR = "0xB90c65b9bA39c616500aEF23cF6B512490f5eb1C";

// When each fee mechanism went live on chain, so a window only calls the getters that exist for it
// PortfolioSubHelper 2.6.0 (block 51710667): a pair's collector OmniVault takes its whole taker fee
const TAKER_FEE_COLLECTORS_START = 1764180368; // 2025-11-26 18:06:08 UTC
// PortfolioSubHelper 2.7.2 (block 71609965): a capped share per (pair, maker) replaces the collectors
const TAKER_FEE_CAPS_START = 1786462822; // 2026-08-11 15:40:22 UTC
// FeeCollector genesis(): kept fees settle weekly from here on
const FEE_COLLECTOR_GENESIS = 1786543200; // 2026-08-12 14:00:00 UTC

// feeMaker / feeTaker are net of any volume rebate
const EXECUTED_EVENT =
  "event Executed(uint8 version, bytes32 indexed pair, uint256 price, uint256 quantity, bytes32 makerOrder, bytes32 takerOrder, uint256 feeMaker, uint256 feeTaker, uint8 takerSide, uint256 execId, address indexed addressMaker, address indexed addressTaker)";
// internal portfolio transfers. RFQ fees reach the FeeCollector through OmniVaultExecutorSub.collectSwapFees, which
// credits it with IXFERREC (6). Order book fees are credited without an event, so these are exactly the RFQ fees
const PORTFOLIO_UPDATED_EVENT =
  "event PortfolioUpdated(uint8 indexed transaction, address indexed wallet, bytes32 indexed symbol, uint256 quantity, uint256 feeCharged, uint256 total, uint256 available, address walletOther)";
const TX_IXFERREC = 6;
// weekly epoch close, splits each collected token between the treasury and the ALOT buyback
const TOKEN_SETTLED_EVENT =
  "event TokenSettled(uint256 indexed epoch, bytes32 indexed symbol, uint256 quantity, uint256 price, uint256 toTreasury, uint256 toBuyback)";

const GET_TRADE_PAIRS_ABI = "function getTradePairs() view returns (bytes32[])";
// minPostAmount (appended June 2025) is left off: every field is static, so this prefix also decodes older pairs
const GET_TRADE_PAIR_ABI =
  "function getTradePair(bytes32) view returns (tuple(bytes32 baseSymbol, bytes32 quoteSymbol, bytes32 buyBookId, bytes32 sellBookId, uint256 minTradeAmount, uint256 maxTradeAmount, uint256 auctionPrice, uint8 auctionMode, uint8 makerRate, uint8 takerRate, uint8 baseDecimals, uint8 baseDisplayDecimals, uint8 quoteDecimals, uint8 quoteDisplayDecimals, uint8 allowedSlippagePercent, bool addOrderPaused, bool pairPaused, bool postOnly))";
const GET_HELPER_ABI = "function getPortfolioSubHelper() view returns (address)";
const TAKER_FEE_COLLECTORS_ABI = "function takerFeeCollectors(bytes32) view returns (address)";
const TAKER_FEE_CAP_BPS_ABI = "function takerFeeCapBps(bytes32, address) view returns (uint32)";
const TENK = 100000; // rate scale, 10 = 1 bp
const GET_TOKEN_DETAILS_ABI =
  "function getTokenDetails(bytes32) view returns (tuple(uint8 decimals, address tokenAddress, uint8 auctionMode, uint32 srcChainId, uint8 l1Decimals, bytes32 symbol, bytes32 symbolId, bytes32 sourceChainSymbol, bool isVirtual))";

// Dexalot L1 balances are portfolio entries, not ERC20s, so fees are priced through coingecko ids keyed by L1 symbol
// from Dexalot's API (new listings need no adapter change). The fallback covers the majors if the API is down.
const COINGECKO_IDS_ENDPOINT = "https://api.dexalot.com/api/stats/coingeckoids";
const COINGECKO_ID_FALLBACK: Record<string, string> = {
  USDC: "usd-coin",
  USDT: "tether",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  AVAX: "avalanche-2",
  ETH: "ethereum",
};

const getCoingeckoIds = async (): Promise<Record<string, string>> => {
  try {
    const rows: { symbol: string; coingecko_id: string }[] = await httpGet(COINGECKO_IDS_ENDPOINT);
    return Object.fromEntries(rows.map((r) => [r.symbol, r.coingecko_id]));
  } catch (e) {
    console.log("fees/dexalot: coingeckoids endpoint unreachable, using the fallback map");
    return COINGECKO_ID_FALLBACK;
  }
};

const ZERO = ADDRESSES.null;

interface PairMeta {
  baseSymbol: string;
  quoteSymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
}

const fetch = async (options: FetchOptions) => {
  const { getLogs, toApi } = options;
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const accruedRevenue = options.createBalances();

  const pairIds: string[] = await toApi.call({ target: TRADE_PAIRS, abi: GET_TRADE_PAIRS_ABI });
  const pairs = await toApi.multiCall({
    abi: GET_TRADE_PAIR_ABI,
    calls: pairIds.map((id: string) => ({ target: TRADE_PAIRS, params: [id] })),
  });
  const pairMetaById: Record<string, PairMeta> = {};
  pairIds.forEach((id: string, i: number) => {
    pairMetaById[id.toLowerCase()] = {
      baseSymbol: ethers.decodeBytes32String(pairs[i].baseSymbol),
      quoteSymbol: ethers.decodeBytes32String(pairs[i].quoteSymbol),
      baseDecimals: Number(pairs[i].baseDecimals),
      quoteDecimals: Number(pairs[i].quoteDecimals),
    };
  });

  // a token without a coingecko id is skipped (logged once) rather than failing the day
  const cgIds = await getCoingeckoIds();
  const unmapped = new Set<string>();
  const cgIdOf = (symbol: string): string | undefined => {
    const id = cgIds[symbol];
    if (!id && !unmapped.has(symbol)) {
      unmapped.add(symbol);
      console.log(`fees/dexalot: unmapped token ${symbol}, its fees are not counted`);
    }
    return id;
  };

  // 1. Order book fees, per fill
  const logs = await getLogs({ target: TRADE_PAIRS, eventAbi: EXECUTED_EVENT });
  const fillKey = (log: any) => `${(log.pair as string).toLowerCase()}|${(log.addressMaker as string).toLowerCase()}`;

  // The OmniVault making a fill can earn part of its taker fee, the getters are read at the window's end block
  const capByKey: Record<string, number> = {};
  const collectorByPair: Record<string, string> = {};
  if (options.endTimestamp > TAKER_FEE_COLLECTORS_START) {
    const helper = await toApi.call({ target: PORTFOLIO_SUB, abi: GET_HELPER_ABI });
    if (options.endTimestamp > TAKER_FEE_CAPS_START) {
      const fillKeys = [...new Set(logs.map(fillKey))];
      const caps = await toApi.multiCall({
        abi: TAKER_FEE_CAP_BPS_ABI,
        calls: fillKeys.map((k) => ({ target: helper, params: k.split("|") as [string, string] })),
      });
      fillKeys.forEach((k, i) => (capByKey[k] = Number(caps[i])));
    } else {
      const collectors = await toApi.multiCall({
        abi: TAKER_FEE_COLLECTORS_ABI,
        calls: pairIds.map((id: string) => ({ target: helper, params: [id] })),
      });
      pairIds.forEach((id: string, i: number) => (collectorByPair[id.toLowerCase()] = collectors[i].toLowerCase()));
    }
  }

  for (const log of logs) {
    const pairId = (log.pair as string).toLowerCase();
    const meta = pairMetaById[pairId];
    if (!meta) {
      console.log(`fees/dexalot: skipping fill on unknown pair ${log.pair}`);
      continue;
    }
    // taker sells (1): maker pays its fee in base, taker in quote. Taker buys (0): the reverse
    const takerSells = Number(log.takerSide) === 1;
    const base = { symbol: meta.baseSymbol, decimals: meta.baseDecimals };
    const quote = { symbol: meta.quoteSymbol, decimals: meta.quoteDecimals };
    const makerFeeToken = takerSells ? base : quote;
    const takerFeeToken = takerSells ? quote : base;
    const makerFee = Number(log.feeMaker) / 10 ** makerFeeToken.decimals;
    const takerFee = Number(log.feeTaker) / 10 ** takerFeeToken.decimals;

    // the maker fee always goes to the protocol
    const makerCgId = cgIdOf(makerFeeToken.symbol);
    if (makerFee > 0 && makerCgId) {
      dailyFees.addCGToken(makerCgId, makerFee, "Maker Fees");
      accruedRevenue.addCGToken(makerCgId, makerFee, "Maker Fees");
    }

    const takerCgId = cgIdOf(takerFeeToken.symbol);
    if (takerFee > 0 && takerCgId) {
      const maker = (log.addressMaker as string).toLowerCase();
      const cap = capByKey[fillKey(log)] ?? 0;
      const collector = collectorByPair[pairId] ?? ZERO;
      let vaultShare = 0;
      if (cap > 0 && maker !== (log.addressTaker as string).toLowerCase()) {
        // the vault earns takerFee * min(cap, rate) / rate. The rate is recovered from the fee itself, so it is the
        // rebate-adjusted one the contract used. Notional is in the fee's token
        const baseQty = Number(log.quantity) / 10 ** meta.baseDecimals;
        const notional = takerFeeToken === base ? baseQty : baseQty * (Number(log.price) / 10 ** meta.quoteDecimals);
        const rate = Math.round((takerFee / notional) * TENK);
        if (rate > 0) vaultShare = (takerFee * Math.min(cap, rate)) / rate;
      } else if (collector !== ZERO && maker === collector) {
        vaultShare = takerFee;
      }
      dailyFees.addCGToken(takerCgId, takerFee, "Taker Fees");
      if (vaultShare > 0) dailySupplySideRevenue.addCGToken(takerCgId, vaultShare, "Taker Fees To OmniVaults");
      if (takerFee - vaultShare > 0) accruedRevenue.addCGToken(takerCgId, takerFee - vaultShare, "Taker Fees");
    }
  }

  // 2. RFQ fees, as they reach the FeeCollector. They are settled with everything else it holds
  if (options.endTimestamp > FEE_COLLECTOR_GENESIS) {
    const rfqLogs = await getLogs({
      target: PORTFOLIO_SUB,
      eventAbi: PORTFOLIO_UPDATED_EVENT,
      topics: [
        ethers.id("PortfolioUpdated(uint8,address,bytes32,uint256,uint256,uint256,uint256,address)"),
        ethers.zeroPadValue(ethers.toBeHex(TX_IXFERREC), 32),
        ethers.zeroPadValue(FEE_COLLECTOR, 32),
      ],
    });
    const rfqSymbols = [...new Set(rfqLogs.map((l: any) => l.symbol as string))];
    const rfqDetails = await toApi.multiCall({
      abi: GET_TOKEN_DETAILS_ABI,
      calls: rfqSymbols.map((s) => ({ target: PORTFOLIO_SUB, params: [s] })),
    });
    const rfqDecimals = Object.fromEntries(rfqSymbols.map((s, i) => [s, Number(rfqDetails[i].decimals)]));
    for (const log of rfqLogs) {
      const cgId = cgIdOf(ethers.decodeBytes32String(log.symbol as string));
      if (cgId) dailyFees.addCGToken(cgId, Number(log.quantity) / 10 ** rfqDecimals[log.symbol as string], "RFQ Fees");
    }
  }

  // 3. Revenue. Before the FeeCollector, kept fees went straight to the treasury, so revenue accrues per fill
  if (options.startTimestamp < FEE_COLLECTOR_GENESIS) {
    return { dailyFees, dailyRevenue: accruedRevenue, dailyProtocolRevenue: accruedRevenue, dailySupplySideRevenue };
  }

  // Since then kept fees collect in the FeeCollector and revenue books on the weekly settlement, valued at its price
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const settledLogs = await getLogs({ target: FEE_COLLECTOR, eventAbi: TOKEN_SETTLED_EVENT });
  const symbols = [...new Set(settledLogs.map((l: any) => l.symbol as string))];
  // the FeeCollector values amounts in the token's portfolio decimals (getTokenDetails().decimals)
  const details = await toApi.multiCall({
    abi: GET_TOKEN_DETAILS_ABI,
    calls: symbols.map((s) => ({ target: PORTFOLIO_SUB, params: [s] })),
  });
  const decimalsBySymbol = Object.fromEntries(symbols.map((s, i) => [s, Number(details[i].decimals)]));
  for (const log of settledLogs) {
    // price is USD per whole token at 1e18
    const unit = 10 ** decimalsBySymbol[log.symbol as string];
    const price = Number(log.price) / 1e18;
    const toTreasuryUsd = (Number(log.toTreasury) / unit) * price;
    const toBuybackUsd = (Number(log.toBuyback) / unit) * price;
    dailyRevenue.addUSDValue(toTreasuryUsd, "Operating Budget");
    dailyRevenue.addUSDValue(toBuybackUsd, "ALOT Buyback");
    dailyProtocolRevenue.addUSDValue(toTreasuryUsd, "Operating Budget");
    dailyHoldersRevenue.addUSDValue(toBuybackUsd, "ALOT Buyback");
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Trading fees paid by takers and makers on Dexalot's order book, net of volume discounts, plus RFQ swap fees.",
  SupplySideRevenue:
    "The share of taker fees an OmniVault (Dexalot's market-making vaults) earns when it is the maker, capped at a per-vault rate. It goes to the vault's depositors.",
  Revenue:
    "Fees kept by the protocol. Since the FeeCollector launch (2026-08-12) they settle once a week at epoch close, so revenue books on the settlement day at the close's on-chain USD value and is zero on the other days. RFQ fees include an integration fee that the treasury later pays to the integrator, it is not deducted.",
  ProtocolRevenue:
    "Before the FeeCollector, every kept fee. Since then the weekly operating budget taken from collected fees at epoch close, sent to the treasury, stables first.",
  HoldersRevenue: "Collected fees above the operating budget, sent to the BuybackVault at epoch close to buy ALOT.",
};

const keptFees = {
  "Maker Fees": "Before the FeeCollector: maker fees, all kept by the protocol.",
  "Taker Fees": "Before the FeeCollector: taker fees less any OmniVault share.",
};
const settlement = {
  "Operating Budget": "The weekly operating budget, taken stables first at epoch close.",
  "ALOT Buyback": "The rest of each settlement, sent to the BuybackVault to buy ALOT.",
};

const breakdownMethodology = {
  Fees: {
    "Maker Fees": "Fee paid by the trader whose resting order was filled.",
    "Taker Fees": "Fee paid by the trader whose order filled against the order book.",
    "RFQ Fees": "Fees on RFQ swaps, collected into the FeeCollector and settled with the order book fees.",
  },
  SupplySideRevenue: {
    "Taker Fees To OmniVaults": "The share of taker fees earned by an OmniVault when it is the maker.",
  },
  Revenue: { ...keptFees, ...settlement },
  ProtocolRevenue: { ...keptFees, "Operating Budget": settlement["Operating Budget"] },
  HoldersRevenue: { "ALOT Buyback": settlement["ALOT Buyback"] },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.DEXALOT],
  start: "2023-02-01",
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
