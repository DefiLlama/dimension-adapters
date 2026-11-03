import ADDRESSES from '../helpers/coreAssets.json'
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const TRADE_PAIRS = "0x09383137c1eee3e1a8bc781228e4199f6b4a9bbf";
const PORTFOLIO_SUB = "0xa5c079c1986e2335d83fa2d7282e162958e515d5";
// https://432204.snowtrace.io/address/0xB90c65b9bA39c616500aEF23cF6B512490f5eb1C
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

// Order book fees are valued in the pair's quote token, base-token fees at the fill price. Quote tokens by L1 symbol,
// including the names used before renames (USDt)
const QUOTE_COINGECKO_ID: Record<string, string> = {
  USDC: "usd-coin",
  USDT: "tether",
  USDt: "tether",
  AVAX: "avalanche-2",
  ETH: "ethereum",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
};

const ZERO = ADDRESSES.null;

interface PairMeta {
  quoteSymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
}

const fetch = async (options: FetchOptions) => {
  const { getLogs, toApi } = options;
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  // before the FeeCollector, kept fees went straight to the treasury
  const preFeeCollector = options.startTimestamp < FEE_COLLECTOR_GENESIS;

  const pairIds: string[] = await toApi.call({ target: TRADE_PAIRS, abi: GET_TRADE_PAIRS_ABI });
  const pairs = await toApi.multiCall({
    abi: GET_TRADE_PAIR_ABI,
    calls: pairIds.map((id: string) => ({ target: TRADE_PAIRS, params: [id] })),
  });
  const pairMetaById: Record<string, PairMeta> = {};
  pairIds.forEach((id: string, i: number) => {
    pairMetaById[id.toLowerCase()] = {
      quoteSymbol: ethers.decodeBytes32String(pairs[i].quoteSymbol),
      baseDecimals: Number(pairs[i].baseDecimals),
      quoteDecimals: Number(pairs[i].quoteDecimals),
    };
  });

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
    const quoteCgId = QUOTE_COINGECKO_ID[meta.quoteSymbol];
    if (!quoteCgId) throw new Error(`fees/dexalot: unmapped quote token ${meta.quoteSymbol}`);
    // price: quote per base. Taker sells (1): maker pays its fee in base, taker in quote. Taker buys (0): the reverse
    const price = Number(log.price) / 10 ** meta.quoteDecimals;
    const inQuote = (fee: bigint, inBase: boolean) =>
      inBase ? (Number(fee) / 10 ** meta.baseDecimals) * price : Number(fee) / 10 ** meta.quoteDecimals;
    const takerSells = Number(log.takerSide) === 1;
    const makerFee = inQuote(log.feeMaker, takerSells);
    const takerFee = inQuote(log.feeTaker, !takerSells);

    // the maker fee always goes to the protocol
    if (makerFee > 0) {
      dailyFees.addCGToken(quoteCgId, makerFee, "Maker Fees");
      dailyRevenue.addCGToken(quoteCgId, makerFee, "Maker Fees To Protocol");
      if (preFeeCollector) dailyProtocolRevenue.addCGToken(quoteCgId, makerFee, "Treasury");
    }

    if (takerFee > 0) {
      const maker = (log.addressMaker as string).toLowerCase();
      const cap = capByKey[fillKey(log)] ?? 0;
      const collector = collectorByPair[pairId] ?? ZERO;
      let vaultShare = 0;
      if (cap > 0 && maker !== (log.addressTaker as string).toLowerCase()) {
        // the vault earns takerFee * min(cap, rate) / rate. The rate is recovered from the fee itself, so it is the
        // rebate-adjusted one the contract used
        const notional = (Number(log.quantity) / 10 ** meta.baseDecimals) * price;
        const rate = Math.round((takerFee / notional) * TENK);
        if (rate > 0) vaultShare = (takerFee * Math.min(cap, rate)) / rate;
      } else if (collector !== ZERO && maker === collector) {
        vaultShare = takerFee;
      }
      dailyFees.addCGToken(quoteCgId, takerFee, "Taker Fees");
      if (vaultShare > 0) dailySupplySideRevenue.addCGToken(quoteCgId, vaultShare, "Taker Fees To OmniVaults");
      if (takerFee - vaultShare > 0) {
        dailyRevenue.addCGToken(quoteCgId, takerFee - vaultShare, "Taker Fees To Protocol");
        if (preFeeCollector) dailyProtocolRevenue.addCGToken(quoteCgId, takerFee - vaultShare, "Treasury");
      }
    }
  }

  // 2. Revenue split
  if (preFeeCollector) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
  }

  // Since then kept fees collect in the FeeCollector and are split on the weekly settlement, valued at its price
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
    dailyProtocolRevenue.addUSDValue(toTreasuryUsd, "Treasury");
    dailyHoldersRevenue.addUSDValue(toBuybackUsd, "ALOT Buyback");
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Trading fees paid by takers and makers on Dexalot's order book, net of volume discounts.",
  SupplySideRevenue:
    "The share of taker fees an OmniVault (Dexalot's market-making vaults) earns when it is the maker, capped at a per-vault rate. It goes to the vault's depositors.",
  Revenue:
    "Fees kept by the protocol, booked per fill: maker fees and taker fees less any OmniVault share.",
  ProtocolRevenue:
    "Kept fees collect in the FeeCollector and settle once a week at epoch close. The operating budget, taken stables first, goes to the treasury and is booked on the settlement day at the close's on-chain USD value. Before the FeeCollector contract (2026-08-12), every kept fee went to the treasury per fill.",
  HoldersRevenue:
    "Settled fees above the operating budget, sent to the BuybackVault at epoch close to buy ALOT and booked on the settlement day.",
};

const breakdownMethodology = {
  Fees: {
    "Maker Fees": "Fee paid by the trader whose resting order was filled.",
    "Taker Fees": "Fee paid by the trader whose order filled against the order book.",
  },
  SupplySideRevenue: {
    "Taker Fees To OmniVaults": "The share of taker fees earned by an OmniVault when it is the maker.",
  },
  Revenue: {
    "Maker Fees To Protocol": "Maker fees, all kept by the protocol.",
    "Taker Fees To Protocol": "Taker fees kept by the protocol after any OmniVault share.",
  },
  ProtocolRevenue: {
    Treasury:
      "The weekly operating budget taken from each settlement at epoch close, stables first. Before the FeeCollector contract (2026-08-12), every kept fee per fill.",
  },
  HoldersRevenue: {
    "ALOT Buyback": "The rest of each settlement, sent to the BuybackVault to buy ALOT.",
  },
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
