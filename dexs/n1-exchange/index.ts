import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const N1_API = "https://api-mainnet.n1.xyz";

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

async function fetch(_options: FetchOptions): Promise<FetchResultVolume> {
  const info: N1InfoResponse = await httpGet(`${N1_API}/info`);
  if (!Array.isArray(info.markets) || info.markets.length === 0) {
    throw new Error("N1 info endpoint returned no markets");
  }

  let dailyVolume = 0;
  let openInterestAtEnd = 0;

  for (const market of info.markets) {
    if (!market.symbol.endsWith("USD")) continue;

    // Pace requests to stay within the public API's rate limits.
    await sleep(200);
    const stats: N1MarketStats = await httpGet(
      `${N1_API}/market/${market.marketId}/stats`,
    );

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

    dailyVolume += volume;
    openInterestAtEnd += openInterest * indexPrice;
  }

  return { dailyVolume, openInterestAtEnd };
}

const adapter: SimpleAdapter = {
  version: 2,
  // Proton exposes rolling 24-hour totals, so hourly slices cannot be summed.
  pullHourly: false,
  adapter: {
    [CHAIN.N1]: {
      fetch,
      runAtCurrTime: true,
    },
  },
  methodology: {
    Volume:
      "Rolling 24-hour quote volume reported by Proton across all N1 Exchange USD perpetual markets.",
    OpenInterest:
      "Current notional open interest across all N1 Exchange USD perpetual markets, calculated as base open interest multiplied by index price.",
  },
};

export default adapter;
