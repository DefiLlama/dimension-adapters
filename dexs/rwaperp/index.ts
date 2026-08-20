import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS_URL =
  "https://api-market.rwaperp.xyz/md/volume/builder/daily_stats?broker_id=rwaperp_xyz";

type DailyStat = {
  date: string;
  takerVolume: string;
};

let statsByDate: Promise<Record<string, DailyStat>> | undefined;

const fetch = async ({ dateString }: FetchOptions) => {
  if (!statsByDate) {
    statsByDate = httpGet(STATS_URL)
      .then((rows: DailyStat[]) => {
        const map: Record<string, DailyStat> = {};
        rows.forEach((row) => {
          map[row.date.slice(0, 10)] = row;
        });
        return map;
      })
      .catch((e) => {
        statsByDate = undefined;
        throw e;
      });
  }

  const day = (await statsByDate)[dateString];
  if (!day) {
    throw new Error(`No daily stats found for ${dateString} from RWA Perp API`);
  }

  const volume = Number(day.takerVolume);
  if (isNaN(volume)) {
    throw new Error(
      `Invalid takerVolume from RWA Perp API for ${dateString}: ${day.takerVolume}`,
    );
  }

  return { dailyVolume: volume };
};

const methodology = {
  Volume:
    "Perpetual futures trading volume on RWA Perp. Volume is attributed to X Layer, RWA Perp's primary deployment chain.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.XLAYER],
  start: "2026-08-19",
  methodology,
};

export default adapter;
