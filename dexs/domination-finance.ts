// Domination Finance perp volume on Base. A position is taken on an asset's
// share of total market cap, so the index is a percentage and the collateral is
// USDC.
//
// The size is collateral x leverage, in USDC. tradeNotional on the same event
// is not that number: it is the position in units of the index at 18 decimals,
// so a filled trade carrying 1.344 USDC at 500x emits 11.3202 against an
// openPrice of 59.3632, and 11.3202 x 59.3632 is the 672 USDC the fee is
// charged on. Read as 6-decimal USDC it comes out about ten orders of magnitude
// high, the twelve decimals it carries over USDC's six less the index price.
//
// Funding is a transfer between the two sides of the book and is not volume; it
// is not counted here or in fees/domination-finance.ts.

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const CALLBACKS = "0x837a6E61C123c6e7cDfff2219A46898D0415343F";

// The Trade tuple is inlined from the implementation behind the proxy, whose
// verified ABI declares both events with these nine components in this order.
const TRADE =
  "(uint256 collateral, uint192 openPrice, uint192 tp, uint192 sl, address trader, uint32 leverage, uint16 pairIndex, uint8 index, bool buy)";
const MARKET_OPEN_EXECUTED =
  `event MarketOpenExecuted(uint256 indexed orderId, ${TRADE} t, uint256 priceImpactP, uint256 tradeNotional)`;
const LIMIT_OPEN_EXECUTED =
  `event LimitOpenExecuted(uint256 indexed orderId, uint256 limitIndex, ${TRADE} t, uint256 priceImpactP, uint256 tradeNotional)`;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const eventAbi of [MARKET_OPEN_EXECUTED, LIMIT_OPEN_EXECUTED]) {
    const logs = await options.getLogs({ target: CALLBACKS, eventAbi });
    for (const log of logs) {
      // collateral carries USDC's 6 decimals and leverage carries 2, so the
      // product over 100 is the notional in USDC with no price and no rounding.
      // In bigint because the decoded fields are typed number, and $1M of
      // collateral at 500x is 5e16, past what a double holds exactly
      const notional = (BigInt(log.t.collateral) * BigInt(log.t.leverage)) / 100n;
      dailyVolume.add(ADDRESSES.base.USDC, notional);
    }
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  // DomfiTradingCallbacks proxy, the contract that records a filled trade.
  start: "2026-06-23",
  methodology: {
    Volume:
      "Notional of every filled open on the DomFi dominance perp book, collateral x leverage from MarketOpenExecuted and LimitOpenExecuted. Closes are excluded so a round trip counts once. Funding is a payment between longs and shorts and is not volume.",
  },
};

export default adapter;
