import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";
import { AFTERMATH_API, AFTERMATH_HISTORY_START, getAftermathMarkets } from "../../helpers/aftermath";

const fetch = async (options: FetchOptions) => {
  const fromTimestamp = options.startOfDay * 1000;
  const toTimestamp = fromTimestamp + 24 * 60 * 60 * 1000;
  // Keep the listing's original start below, but never overwrite unavailable legacy history with zeroes.
  if (fromTimestamp < Date.parse(AFTERMATH_HISTORY_START))
    throw new Error(`Aftermath legacy history is unavailable; refill only from ${AFTERMATH_HISTORY_START}`);
  if (toTimestamp > Date.now()) throw new Error("Aftermath daily candle is not closed yet");

  const markets = await getAftermathMarkets();
  let candleCount = 0;
  const { results } = await PromisePool.withConcurrency(3).for(markets)
    .handleError((error) => { throw error; })
    .process(async (market) => {
      // Explicit bounds avoid CCXT's unbounded since -> now query and its history-range limit.
      const response = await httpPost(`${AFTERMATH_API}/market/candle-history`, {
        marketId: market.objectId, resolution: "1d", fromTimestamp, toTimestamp,
      });
      if (!Array.isArray(response?.candles)) throw new Error(`Invalid Aftermath candles: ${market.objectId}`);
      if (response.candles.length === 0) {
        // A market may not have launched yet on this date. Confirm there were no fills before
        // accepting an absent candle; a missing candle on a trading day must fail the refill.
        const history = await httpPost(`${AFTERMATH_API}/market/order-history`, {
          marketId: market.objectId, beforeTimestampCursor: toTimestamp, limit: 1,
        });
        if (!Array.isArray(history?.orders)) throw new Error(`Invalid Aftermath trade history: ${market.objectId}`);
        for (const order of history.orders) {
          if (!Number.isSafeInteger(order.timestamp) || order.timestamp < 0 || order.timestamp >= fromTimestamp)
            throw new Error(`Missing Aftermath candle for a trading day: ${market.objectId}`);
        }
        return 0;
      }
      const [candle] = response.candles;
      if (response.candles.length !== 1 || candle?.timestamp !== fromTimestamp
        || !Number.isFinite(candle.volume) || candle.volume < 0)
        throw new Error(`Invalid Aftermath daily candle: ${market.objectId}`);
      candleCount++;
      // Candle volume is already USD from FilledTakerOrder quote deltas, counted once per fill.
      return candle.volume as number;
    });

  if (!candleCount) throw new Error("Missing Aftermath daily candles for all markets");
  return { dailyVolume: results.reduce((total, volume) => total + volume, 0) };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-02-18",
    },
  },
  methodology: {
    Volume: "Daily USD notional of taker trades across Aftermath's relaunched USDC perpetual markets; excludes liquidations and unavailable legacy-market history before August 18, 2026.",
  },
};

export default adapter;
