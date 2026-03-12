import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_BASE = "https://app.perptools.ai/api";

interface DailyVolumeResponse {
  volume_usd: string;
  broker_fee_usd: string;
}

function formatDateFromTimestamp(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetch(_: number, __: any, options: FetchOptions): Promise<FetchResultV2> {
  const dateStr = formatDateFromTimestamp(options.startOfDay);
  const url = `${API_BASE}/v1/volume/daily?date=${dateStr}`;
  const data = (await httpGet(url)) as DailyVolumeResponse;
  const dailyVolume = Number(data.volume_usd ?? 0);
  const dailyFees = Number(data.broker_fee_usd ?? 0);
  if (isNaN(dailyVolume) || dailyVolume < 0) {
    throw new Error(`Invalid daily volume from API: ${data.volume_usd} for date ${dateStr}`);
  }
  if (isNaN(dailyFees) || dailyFees < 0) {
    throw new Error(`Invalid broker fee from API: ${data.broker_fee_usd} for date ${dateStr}`);
  }
  return { dailyVolume, dailyFees };
}

const methodology = {
  Volume:
    "Daily perps trading volume (maker + taker) for each UTC day, aggregated from Orderly leaderboard via Perptools API. Supports backfill for historical dates.",
  Fees: "Broker fee collected by Perptools as builder on Orderly Network, summed from leaderboard rows.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ORDERLY],
  start: "2026-02-10", // Perptools/Orderly launch
  methodology,
};

export default adapter;
