import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const N1_API = "https://api-mainnet.n1.xyz";
const N1_API_CONCURRENCY = 5;
const N1_API_REQUEST_DELAY_MS = 200;

interface N1Market {
  marketId: number;
  symbol: string;
}

interface N1InfoResponse {
  markets: N1Market[];
}

interface N1MarketStats {
  volumeQuote24h: number;
  indexPrice: number | null;
  perpStats: {
    open_interest: number;
  } | null;
}

async function fetch(options: FetchOptions): Promise<FetchResultVolume> {
  if (options.chain !== CHAIN.N1) {
    throw new Error(`Unsupported chain: ${options.chain}`);
  }

  const info: N1InfoResponse = await httpGet(`${N1_API}/info`);
  if (!Array.isArray(info.markets) || info.markets.length === 0) {
    throw new Error("N1 info endpoint returned no markets");
  }

  const usdMarkets = info.markets.filter((market) => market.symbol.endsWith("USD"));
  if (usdMarkets.length === 0) {
    throw new Error("N1 info endpoint returned no USD markets");
  }

  const { results, errors } = await PromisePool
    .withConcurrency(N1_API_CONCURRENCY)
    .for(usdMarkets)
    .process(async (market) => {
      // N1's public API permits 50 requests per second. Five workers pausing
      // 200 ms before each request keep this adapter below that limit.
      await sleep(N1_API_REQUEST_DELAY_MS);
      const stats: N1MarketStats = await httpGet(
        `${N1_API}/market/${market.marketId}/stats`,
      );

      if (stats.indexPrice === null) {
        throw new Error(`N1 market ${market.marketId} returned a null index price`);
      }

      const volume = Number(stats.volumeQuote24h);
      const indexPrice = Number(stats.indexPrice);
      const openInterest = Number(stats.perpStats?.open_interest);
      if (
        !Number.isFinite(volume) ||
        volume < 0 ||
        !Number.isFinite(indexPrice) ||
        indexPrice < 0 ||
        !Number.isFinite(openInterest) ||
        openInterest < 0
      ) {
        throw new Error(`N1 market ${market.marketId} returned invalid stats`);
      }

      return {
        volume,
        openInterest: openInterest * indexPrice,
      };
    });

  if (errors.length > 0) {
    throw new Error(
      `Failed to fetch ${errors.length} of ${usdMarkets.length} N1 markets: ${errors[0].message}`,
    );
  }

  const dailyVolume = results.reduce((sum, result) => sum + result.volume, 0);
  const openInterestAtEnd = results.reduce(
    (sum, result) => sum + result.openInterest,
    0,
  );

  return { dailyVolume, openInterestAtEnd };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.N1],
  start: "2025-12-08",
  runAtCurrTime: true,
  // N1 exposes rolling 24-hour totals, so hourly slices cannot be summed.
  pullHourly: false,
  methodology: {
    Volume:
      "Rolling 24-hour quote volume reported by N1 across all N1 Exchange USD perpetual markets.",
    OpenInterest:
      "Current notional open interest across all N1 Exchange USD perpetual markets, calculated as base open interest multiplied by index price.",
  },
};

export default adapter;
