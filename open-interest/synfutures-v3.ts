import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const OVERVIEW_URL = "https://api.synfutures.com/s3/config/info-page/v3/overview.json";
// the snapshot carries its own build time in `updateAt` and used to move every day,
// so anything older than two days is a stale file rather than a current reading
const MAX_SNAPSHOT_AGE = 2 * 24 * 60 * 60;

const fetch = async (options: FetchOptions) => {
  const overview = await fetchURL(OVERVIEW_URL);

  const openInterestAtEnd = Number(overview?.totalOI);
  const updatedAt = Number(overview?.updateAt);
  if (!Number.isFinite(openInterestAtEnd) || !Number.isFinite(updatedAt))
    throw new Error(
      `synfutures-v3: unreadable overview snapshot (totalOI ${JSON.stringify(overview?.totalOI)}, updateAt ${JSON.stringify(overview?.updateAt)})`
    );

  const snapshotAge = options.endTimestamp - updatedAt / 1000;
  if (snapshotAge > MAX_SNAPSHOT_AGE)
    throw new Error(
      `synfutures-v3: overview snapshot was last built ${Math.floor(snapshotAge / 86400)} days ago (updateAt ${new Date(updatedAt).toISOString()}), open interest is not current`
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
