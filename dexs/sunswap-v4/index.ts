import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Daily volume from the SUN.io API (daily aggregates, UTC 00:00 millisecond timestamps).
// On-chain source, in case the API has to be replaced: SunSwap V4 PoolManager (singleton, emits Swap events)
// https://tronscan.org/#/contract/TVjuTE3V5bMVdpfNhid8kD2v35T2k1u1Br
const VOLUME_API = "https://sbc.endjgfsv.link/scan/volume?version=v4";

interface IValue {
  time: number;
  volume: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const data: IValue[] = (await fetchURL(VOLUME_API)).data?.list;
  if (!Array.isArray(data))
    throw new Error("sunswap-v4: the volume endpoint returned no list");
  const day = data.find((item) => (item.time / 1000) === options.startOfDay);
  if (!day)
    throw new Error(`sunswap-v4: the volume endpoint has no row for ${options.dateString}`);
  return { dailyVolume: day.volume };
}

const adapter: SimpleAdapter = {
  version: 1, // the source API only returns daily aggregates
  fetch,
  chains: [CHAIN.TRON],
  // SunSwap V4 launched on 2026-03-02 00:00 UTC+8 (2026-03-01 16:00 UTC), so 2026-03-01 is the first UTC day with real activity.
  // Earlier rows from the API are pre-launch testing (0 or < $1 per day) and are excluded.
  // Launch announcement: https://sunio.zendesk.com/hc/en-us/articles/55621682087449-Announcement-on-the-Launch-of-SunSwap-V4-on-SUN-io
  start: '2026-03-01',
  methodology: {
    Volume: 'Daily swap volume on SunSwap V4 pools, reported by the SUN.io API.',
  },
}

export default adapter;
