import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS_URL =
  "https://api-market.halfmoondex.com/md/volume/builder/daily_stats?broker_id=halfmoon";

type DailyStat = {
  date: string;
  takerVolume: string;
};

let statsByDate: Promise<Record<string, DailyStat>> | undefined;

const fetch = async ({ dateString }: FetchOptions) => {
  if (!statsByDate) {
    statsByDate = httpGet(STATS_URL).then((rows: DailyStat[]) => {
      const map: Record<string, DailyStat> = {};
      rows.forEach((row) => {
        map[row.date.slice(0, 10)] = row;
      });
      return map;
    });
  }

  const day = (await statsByDate)[dateString];
  if (!day) {
    return { dailyVolume: 0 };
  }

  return { dailyVolume: Number(day.takerVolume) || 0 };
};

const methodology = {
  Volume:
    "Perpetual futures trading volume on HalfMoon. Volume is attributed to Avalanche, HalfMoon's primary deployment chain.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.AVAX],
  start: "2025-12-24",
  methodology,
};

export default adapter;
