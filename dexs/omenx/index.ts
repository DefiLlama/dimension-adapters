import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const VOLUME_URL = "https://www.omenx.com/pub/platform/volume";

interface VolumeResponse {
  code: number;
  msg: string | null;
  data: {
    volumeUsd: number | null;
    notionalUsd: number | null;
    ready: boolean;
  } | null;
}

const fetch = async (options: FetchOptions) => {
  // runAdapter passes startTimestamp as the hour boundary minus 1s; the API only accepts whole UTC hours
  const start = Math.ceil(options.startTimestamp / 3600) * 3600;
  const res: VolumeResponse = await fetchURL(`${VOLUME_URL}?start=${start}&end=${options.endTimestamp}`);

  // ready=false means trades in this window are not all on the ledger yet; fail so the window is retried later
  if (res.code !== 0 || !res.data?.ready || res.data.volumeUsd == null || res.data.notionalUsd == null)
    throw new Error(`OmenX volume not available for ${start}-${options.endTimestamp}: ${JSON.stringify(res)}`);

  return {
    dailyVolume: Number(res.data.volumeUsd),
    dailyNotionalVolume: Number(res.data.notionalUsd),
  };
};

const methodology = {
  Volume: "Sum of YES price x shares over taker-side fills, so each trade is counted once. NO-side fills are converted to the YES price (1 - NO price). Includes trades by platform market-maker accounts. Computed from trades recorded on the OmenX ledger on Base (0xacf666Ff4fDAb8FeC552801471dbA7e8F1d0c058).",
  NotionalVolume: "Sum of shares over taker-side fills, each share valued at 1 USD. Includes trades by platform market-maker accounts.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.OFF_CHAIN],
  fetch,
  start: "2026-10-30",
  methodology,
};

export default adapter;
