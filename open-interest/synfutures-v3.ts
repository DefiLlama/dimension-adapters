import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const OVERVIEW_URL = "https://api.synfutures.com/s3/config/info-page/v3/overview.json";
const SECONDS_PER_DAY = 24 * 60 * 60;
// the snapshot carries its own build time in `updateAt` and used to move every day,
// so anything older than two days is a stale file rather than a current reading
const MAX_SNAPSHOT_AGE = 2 * SECONDS_PER_DAY;

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const fetch = async (options: FetchOptions) => {
  const overview = await fetchURL(OVERVIEW_URL);

  const openInterestAtEnd = readNumber(overview?.totalOI);
  const updatedAt = readNumber(overview?.updateAt);
  if (openInterestAtEnd === null || openInterestAtEnd < 0 || updatedAt === null)
    throw new Error(
      `synfutures-v3: unreadable overview snapshot (totalOI ${JSON.stringify(overview?.totalOI)}, updateAt ${JSON.stringify(overview?.updateAt)})`
    );

  const snapshotAge = options.endTimestamp - updatedAt / 1000;
  if (snapshotAge > MAX_SNAPSHOT_AGE)
    throw new Error(
      `synfutures-v3: overview snapshot was last built ${Math.floor(snapshotAge / SECONDS_PER_DAY)} days ago (updateAt ${new Date(updatedAt).toISOString()}), open interest is not current`
    );

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: '2024-06-26',
  runAtCurrTime: true
};

export default adapter;
