// A position is taken on an asset's share of total market cap, so the index is a
// percentage and the collateral USDC. Size is collateral x leverage; tradeNotional
// is that position in index units at 18 decimals, ten orders of magnitude out.

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { getPositionedLogArgs } from "../helpers/logs";

const CALLBACKS = "0x837a6E61C123c6e7cDfff2219A46898D0415343F";
// first MarketOpenExecuted / LimitOpenExecuted on the callbacks proxy
const FIRST_OPEN_BLOCK = 48116661;
// closeTradeMarket percentage is of the live position: 10000 = 100%, 5000 = 50%
// https://docs.domination.finance/docs/developers/contracts/
const CLOSE_PCT_PRECISION = 10000n;

const TRADE =
  "(uint256 collateral, uint192 openPrice, uint192 tp, uint192 sl, address trader, uint32 leverage, uint16 pairIndex, uint8 index, bool buy)";
const MARKET_OPEN_EXECUTED =
  `event MarketOpenExecuted(uint256 indexed orderId, ${TRADE} t, uint256 priceImpactP, uint256 tradeNotional)`;
const LIMIT_OPEN_EXECUTED =
  `event LimitOpenExecuted(uint256 indexed orderId, uint256 limitIndex, ${TRADE} t, uint256 priceImpactP, uint256 tradeNotional)`;
const MARKET_CLOSE_EXECUTED =
  "event MarketCloseExecuted(uint256 indexed orderId, uint256 indexed tradeId, uint256 price, uint256 priceImpactP, int256 percentProfit, uint256 usdcSentToTrader, uint256 percentageClosed)";
const LIMIT_CLOSE_EXECUTED =
  "event LimitCloseExecuted(uint256 indexed orderId, uint256 indexed tradeId, uint8 orderType, uint256 price, uint256 priceImpactP, int256 percentProfit, uint256 usdcSentToTrader)";

const positionNotional = (t: { collateral: bigint | string; leverage: bigint | string }) =>
  (BigInt(t.collateral) * BigInt(t.leverage)) / 100n;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);
  const read = (eventAbi: string) =>
    getPositionedLogArgs(options, {
      target: CALLBACKS,
      eventAbi,
      fromBlock: FIRST_OPEN_BLOCK,
      toBlock,
      cacheInCloud: true,
    });

  const [marketOpens, limitOpens, marketCloses, limitCloses] = await Promise.all([
    read(MARKET_OPEN_EXECUTED),
    read(LIMIT_OPEN_EXECUTED),
    read(MARKET_CLOSE_EXECUTED),
    read(LIMIT_CLOSE_EXECUTED),
  ]);

  // tradeId on close is the open's orderId (same id as VaultOpeningFeeCharged).
  // Shrink after each close: percentageClosed and limit 100% are of the live size,
  // so a later close must not reuse the original open notional.
  const remaining = new Map<string, bigint>();
  for (const log of [...marketOpens, ...limitOpens]) {
    const notional = positionNotional(log.t);
    remaining.set(BigInt(log.orderId).toString(), notional);
    if (log.blockNumber >= fromBlock && log.blockNumber <= toBlock) {
      dailyVolume.add(ADDRESSES.base.USDC, notional);
    }
  }

  const closes: any[] = [
    ...marketCloses.map((log) => ({ ...log, pct: BigInt(log.percentageClosed) })),
    ...limitCloses.map((log) => ({ ...log, pct: CLOSE_PCT_PRECISION })),
  ].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  for (const log of closes) {
    const id = BigInt(log.tradeId).toString();
    const size = remaining.get(id);
    if (size === undefined) {
      continue;
    }
    const closed = (size * log.pct) / CLOSE_PCT_PRECISION;
    remaining.set(id, size - closed);
    if (log.blockNumber >= fromBlock && log.blockNumber <= toBlock) {
      dailyVolume.add(ADDRESSES.base.USDC, closed);
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-06-23",
  methodology: {
    Volume:
      "Notional of every filled open and close on the DomFi dominance perp book. Opens are collateral x leverage from MarketOpenExecuted and LimitOpenExecuted. Closes scale the remaining open notional: market closes by percentageClosed, limit closes (TP/SL/liquidation) at 100% of what is still open.",
  },
};

export default adapter;
