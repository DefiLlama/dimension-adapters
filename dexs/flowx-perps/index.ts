import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  // the API answers a bare number, and 0 for an empty hour; wrap it so httpGet's empty-body check does not throw
  const { volume } = await httpGet(
    `https://api.flowx.finance/flowx-be/api/perp-tracking/volume-in-timerange?startTime=${fromTimestamp * 1000}&endTime=${toTimestamp * 1000}`,
    { transformResponse: (body: string) => ({ volume: Number(body) }) },
  );
  if (!Number.isFinite(volume)) throw new Error(`flowx perps: unexpected volume response ${volume}`);

  return { dailyVolume: volume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-10-01",
};

export default adapter;
