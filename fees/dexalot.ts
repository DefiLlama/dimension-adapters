import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const TRADE_PAIRS = "0x09383137c1eee3e1a8bc781228e4199f6b4a9bbf";

// feeMaker/feeTaker are already net of any per-trader volume rebate.
const EXECUTED_EVENT =
  "event Executed(uint8 version, bytes32 indexed pair, uint256 price, uint256 quantity, bytes32 makerOrder, bytes32 takerOrder, uint256 feeMaker, uint256 feeTaker, uint8 takerSide, uint256 execId, address indexed addressMaker, address indexed addressTaker)";

const GET_TRADE_PAIRS_ABI = "function getTradePairs() view returns (bytes32[])";
const GET_TRADE_PAIR_ABI =
  "function getTradePair(bytes32) view returns (tuple(bytes32 baseSymbol, bytes32 quoteSymbol, bytes32 buyBookId, bytes32 sellBookId, uint256 minTradeAmount, uint256 maxTradeAmount, uint256 auctionPrice, uint8 auctionMode, uint8 makerRate, uint8 takerRate, uint8 baseDecimals, uint8 baseDisplayDecimals, uint8 quoteDecimals, uint8 quoteDisplayDecimals, uint8 allowedSlippagePercent, bool addOrderPaused, bool pairPaused, bool postOnly, uint256 minPostAmount))";

const QUOTE_COINGECKO_ID: Record<string, string> = {
  USDC: "usd-coin",
  USDT: "tether",
  AVAX: "avalanche-2",
};

interface PairMeta {
  quoteSymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
}

const fetch = async (options: FetchOptions) => {
  const { getLogs, toApi } = options;
  const dailyFees = options.createBalances();

  const pairIds: string[] = await toApi.call({ target: TRADE_PAIRS, abi: GET_TRADE_PAIRS_ABI });
  const pairs = await toApi.multiCall({
    abi: GET_TRADE_PAIR_ABI,
    calls: pairIds.map((id: string) => ({ target: TRADE_PAIRS, params: [id] })),
  });

  const pairMetaById: Record<string, PairMeta> = {};
  pairIds.forEach((id: string, i: number) => {
    const p = pairs[i];
    pairMetaById[id.toLowerCase()] = {
      quoteSymbol: ethers.decodeBytes32String(p.quoteSymbol),
      baseDecimals: Number(p.baseDecimals),
      quoteDecimals: Number(p.quoteDecimals),
    };
  });

  const logs = await getLogs({ target: TRADE_PAIRS, eventAbi: EXECUTED_EVENT });

  for (const log of logs) {
    const meta = pairMetaById[(log.pair as string).toLowerCase()];
    if (!meta) {
      console.log(`fees/dexalot: skipping Executed log for unknown/removed pair ${log.pair}`);
      continue;
    }
    const quoteCgId = QUOTE_COINGECKO_ID[meta.quoteSymbol];
    if (!quoteCgId) throw new Error(`fees/dexalot: unmapped quote token ${meta.quoteSymbol}`);

    // takerSide SELL(1): maker pays fee in base, taker in quote. BUY(0): reversed.
    const takerSide = Number(log.takerSide);
    const makerFeeInBase = takerSide === 1;
    const takerFeeInBase = takerSide === 0;

    // price: quote tokens per base token
    const price = Number(log.price) / 10 ** meta.quoteDecimals;

    const makerFeeInQuote = makerFeeInBase
      ? (Number(log.feeMaker) / 10 ** meta.baseDecimals) * price
      : Number(log.feeMaker) / 10 ** meta.quoteDecimals;
    const takerFeeInQuote = takerFeeInBase
      ? (Number(log.feeTaker) / 10 ** meta.baseDecimals) * price
      : Number(log.feeTaker) / 10 ** meta.quoteDecimals;

    if (makerFeeInQuote > 0) dailyFees.addCGToken(quoteCgId, makerFeeInQuote, "Maker Fees");
    if (takerFeeInQuote > 0) dailyFees.addCGToken(quoteCgId, takerFeeInQuote, "Taker Fees");
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees:
    "Trading fees paid by users buying and selling on Dexalot's order book.",
  Revenue:
    "Same as Fees - none of it is paid back out to liquidity providers or market makers beyond the individual trader discounts.",
  ProtocolRevenue:
    "Paid to Dexalot's treasury.",
};

const breakdownMethodology = {
  Fees: {
    "Maker Fees": "Fee paid by the trader whose resting order got filled.",
    "Taker Fees": "Fee paid by the trader whose order filled immediately against the order book.",
  },
  Revenue: {
    "Maker Fees": "Maker fees kept by the protocol.",
    "Taker Fees": "Taker fees kept by the protocol.",
  },
  ProtocolRevenue: {
    "Maker Fees": "Maker fees assumed to go to Dexalot's treasury.",
    "Taker Fees": "Taker fees assumed to go to Dexalot's treasury.",
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
