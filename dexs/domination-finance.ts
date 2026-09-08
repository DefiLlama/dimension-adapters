// A position is taken on an asset's share of total market cap, so the index is a
// percentage and the collateral USDC. Size is collateral x leverage; tradeNotional
// is that position in index units at 18 decimals, ten orders of magnitude out.

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const CALLBACKS = "0x837a6E61C123c6e7cDfff2219A46898D0415343F";

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
      // collateral carries 6 decimals and leverage 2, so the product over 100 is
      // USDC. In bigint because $1M at 500x is 5e16, past an exact double.
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
  start: "2026-06-23",
  methodology: {
    Volume:
      "Notional of every filled open on the DomFi dominance perp book, collateral x leverage from MarketOpenExecuted and LimitOpenExecuted. Closes are excluded so a round trip counts once. Funding is a payment between longs and shorts and is not volume.",
  },
};

export default adapter;
