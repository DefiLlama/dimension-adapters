import { FetchOptions } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const API_BASE = process.env.ANCHORED_API_BASE || "https://rwa-api.anchored.finance/rwa/api/v2/defillama";

export type AnchoredDimensions = {
  dailyVolume: string;
  dailyFees: string;
  dailyUserFees: string;
  dailyRevenue: string;
  dailyProtocolRevenue: string;
};

type BaseResponse<T> = {
  code: number;
  errMsg?: string;
  data?: T;
};

export async function fetchAnchoredDimensions(options: FetchOptions): Promise<AnchoredDimensions> {
  const params = new URLSearchParams({
    chain: options.chain,
    startTimestamp: String(options.startTimestamp),
    endTimestamp: String(options.endTimestamp),
  });
  const response: BaseResponse<AnchoredDimensions> = await httpGet(`${API_BASE}/dimensions?${params}`);
  if (!response || response.code !== 200 || !response.data) {
    throw new Error(response?.errMsg || `Anchored dimensions endpoint failed for ${options.chain}`);
  }
  return response.data;
}

export function toNumber(value?: string): number {
  return Number(value || 0);
}
