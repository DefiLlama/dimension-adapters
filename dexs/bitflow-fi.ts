import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const volumeURL =
  "https://bff.bitflowapis.finance/api/app/v2/analytics/volume/daily";

interface DailyVolumeResponse {
  days: { date: string; volumeUsd: number }[];
}

const fetch = async ({ startOfDay }: FetchOptions) => {
  const date = new Date(startOfDay * 1000).toISOString().slice(0, 10);
  const body: DailyVolumeResponse = await fetchURL(
    `${volumeURL}?timestamp=${startOfDay}`,
  );
  // Missing history must remain missing until the source has been backfilled.
  if (!Array.isArray(body?.days) || body.days.length !== 1)
    throw new Error(`bitflow: missing or ambiguous daily volume for ${date}`);

  const row = body.days[0];
  if (row?.date !== date || !Number.isFinite(row.volumeUsd) || row.volumeUsd < 0)
    throw new Error(`bitflow: invalid daily volume for ${date}`);

  return { dailyVolume: row.volumeUsd };
};

const adapter: SimpleAdapter = {
  // The Bitflow v2 API returns UTC daily aggregates, not hourly windows.
  version: 1,
  fetch,
  chains: [CHAIN.STACKS],
  runAtCurrTime: false,
  methodology: {
    Volume:
      "USD volume of swaps in Bitflow pools for each UTC calendar day, excluding liquidity additions and withdrawals.",
  },
};

export default adapter;
