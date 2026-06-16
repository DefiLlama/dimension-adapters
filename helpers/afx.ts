import type { FetchOptions } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const API = "https://api10.afx.xyz/info/integrations/defillama";
const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "defillama-dimension-adapters/1.0",
};
export const AFX_START = "2026-05-29";

type DataResponse<T> = {
  code: number;
  message?: string;
  data: T;
};

export type AfxDailyStats = {
  protocol: string;
  chain: string;
  date: string;
  timestamp: number;
  dailyVolumeUsd?: string | null;
  dailyFeesUsd?: string | null;
  dailyUserFeesUsd?: string | null;
  openInterestUsd?: string | null;
  dailyRevenueUsd?: string | null;
  activeOrderUsers?: number | null;
  dataStatus?: string | null;
};

export async function fetchAfxDailyStats(options: FetchOptions): Promise<AfxDailyStats | undefined> {
  const start = options.startOfDay;
  const end = start + 86_400;
  const response = await get<DataResponse<AfxDailyStats[]>>(
    `${API}/protocol/daily?start=${start}&end=${end}`
  );
  const rows = response.data ?? [];

  const row = rows.find((row) => row.timestamp === start || row.date === options.dateString);
  if (!row) {
    throw new Error(`afx: missing daily stats for ${options.dateString}`);
  }
  return row;
}

export function usd(value?: string | number | null) {
  return value ?? "0";
}

async function get<T>(url: string): Promise<T> {
  const response = await httpGet(url, { headers: HEADERS }) as DataResponse<unknown>;
  if (response.code !== 0) {
    throw new Error(`afx: ${response.message ?? "unexpected API response"}`);
  }
  return response as T;
}
