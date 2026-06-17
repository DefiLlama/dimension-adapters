import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_URL = "https://vol.mainnet.deriverse.io/volumes";
const MARKET = "spot";
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;
const HOURLY_START_TIMESTAMP = 1779321600; // 2026-05-21T00:00:00.000Z

interface VolumeResponse {
  period?: string;
  market?: string;
  date?: string | null;
  windowStart?: string;
  windowEnd?: string;
  totals?: {
    usd?: number | null;
  };
  coverage?: {
    totalRows?: number;
    rawOnlyRows?: number;
    usdComplete?: boolean;
  };
}

const getDailyVolume = (response: VolumeResponse, context: string) => {
  if (response.coverage && response.coverage.usdComplete === false) {
    throw new Error(`Deriverse volume API has ${response.coverage.rawOnlyRows ?? "some"} rows without USD coverage`);
  }

  const dailyVolume = response.totals?.usd;
  if (dailyVolume === null || dailyVolume === undefined) {
    if (response.coverage?.totalRows === 0) return 0;
    throw new Error(`Deriverse volume API did not return USD volume for ${context}`);
  }

  if (!Number.isFinite(dailyVolume)) {
    throw new Error(`Invalid Deriverse daily volume for ${context}`);
  }

  return dailyVolume;
};

const fetchRangeVolume = async (options: FetchOptions, bucketStartTimestamp: number) => {
  const response: VolumeResponse = await httpGet(
    `${API_URL}?period=range&startTimestamp=${bucketStartTimestamp}&endTimestamp=${options.endTimestamp}&market=${MARKET}`
  );

  if (response.period !== "range" || response.market !== MARKET) {
    throw new Error(`Unexpected Deriverse volume API response for ${bucketStartTimestamp}-${options.endTimestamp}`);
  }

  const expectedWindowStart = new Date(bucketStartTimestamp * 1000).toISOString();
  const expectedWindowEnd = new Date(options.endTimestamp * 1000).toISOString();
  if (response.windowStart !== expectedWindowStart || response.windowEnd !== expectedWindowEnd) {
    throw new Error(
      `Deriverse volume API returned window ${response.windowStart}-${response.windowEnd}, expected ${expectedWindowStart}-${expectedWindowEnd}`
    );
  }

  return { dailyVolume: getDailyVolume(response, `${bucketStartTimestamp}-${options.endTimestamp}`) };
};

const fetchDailyBackfillVolume = async (options: FetchOptions) => {
  const response: VolumeResponse = await httpGet(`${API_URL}?period=day&date=${options.dateString}&market=${MARKET}`);
  const expectedWindowEnd = new Date((Date.parse(`${options.dateString}T00:00:00.000Z`) / 1000 + DAY_SECONDS) * 1000)
    .toISOString()
    .slice(0, 10);

  if (
    response.period !== "day" ||
    response.market !== MARKET ||
    response.date !== options.dateString ||
    response.windowStart !== options.dateString ||
    response.windowEnd !== expectedWindowEnd
  ) {
    throw new Error(`Unexpected Deriverse daily volume API response for ${options.dateString}`);
  }

  return { dailyVolume: getDailyVolume(response, options.dateString) };
};

const fetch = async (options: FetchOptions) => {
  const bucketStartTimestamp = options.endTimestamp - HOUR_SECONDS;

  if (bucketStartTimestamp >= HOURLY_START_TIMESTAMP) {
    return fetchRangeVolume(options, bucketStartTimestamp);
  }

  if (bucketStartTimestamp !== options.startTimestamp + 1 || bucketStartTimestamp % DAY_SECONDS !== 0) {
    return { dailyVolume: 0 };
  }

  return fetchDailyBackfillVolume(options);
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  // The hourly runner gates slots by start <= endTimestamp - 1 day; this makes 2026-04-27 the first loaded UTC day.
  start: "2026-04-26T01:00:00.000Z",
  methodology: {
    Volume:
      "Deriverse spot volume.",
  },
};

export default adapter;
