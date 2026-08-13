import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "./env";

export const GATE_SWAP_API_URL = "https://web3-biz-swapapi-prod.w3-api.com/web3api/v3/transaction/defillama/dimensions";

export type GateSwapDimensions = {
  chainId: number | string;
  chain: string;
  volumeUsd: number;
  feesUsd: number;
  userFeesUsd: number;
  revenueUsd: number;
  protocolRevenueUsd: number;
  supplySideRevenueUsd: number;
};

type GateSwapResponse = {
  data: Array<Omit<GateSwapDimensions, "volumeUsd" | "feesUsd" | "userFeesUsd" | "revenueUsd" | "protocolRevenueUsd" | "supplySideRevenueUsd"> & {
    volumeUsd: number | string;
    feesUsd: number | string;
    userFeesUsd: number | string;
    revenueUsd: number | string;
    protocolRevenueUsd: number | string;
    supplySideRevenueUsd: number | string;
  }>;
};

export const gateSwapChainConfig: Record<string, { start: string; chainId: string }> = {
  [CHAIN.ETHEREUM]: { start: "2026-02-28", chainId: "1" },
  [CHAIN.BSC]: { start: "2026-02-28", chainId: "56" },
  [CHAIN.BASE]: { start: "2026-02-28", chainId: "8453" },
  [CHAIN.ARBITRUM]: { start: "2026-02-28", chainId: "42161" },
  [CHAIN.AVAX]: { start: "2026-02-28", chainId: "43114" },
  [CHAIN.BLAST]: { start: "2026-02-28", chainId: "81457" },
  [CHAIN.LINEA]: { start: "2025-09-10", chainId: "59144" },
  [CHAIN.OPTIMISM]: { start: "2026-02-28", chainId: "10" },
  [CHAIN.GATE_LAYER]: { start: "2026-02-28", chainId: "10088" },
  [CHAIN.BERACHAIN]: { start: "2026-02-28", chainId: "80094" },
  [CHAIN.ENI]: { start: "2026-02-28", chainId: "173" },
  [CHAIN.SONIC]: { start: "2026-02-28", chainId: "146" },
  [CHAIN.POLYGON]: { start: "2026-03-04", chainId: "137" },
  [CHAIN.ROBINHOOD]: { start: "2026-07-15", chainId: "4663" },
  [CHAIN.WC]: { start: "2026-02-28", chainId: "480" },
  [CHAIN.ERA]: { start: "2025-09-01", chainId: "324" },
  [CHAIN.SOLANA]: { start: "2026-02-28", chainId: "501" },
};

const USD_FIELDS = ["volumeUsd", "feesUsd", "userFeesUsd", "revenueUsd", "protocolRevenueUsd", "supplySideRevenueUsd"] as const;

/** Fetches and validates Gate Swap dimension rows for one hourly adapter window. */
export async function prefetchGateSwapDimensions(options: FetchOptions): Promise<GateSwapDimensions[]> {
  const query = new URLSearchParams({
    startTimestamp: options.startTimestamp.toString(),
    endTimestamp: options.endTimestamp.toString(),
  });
  const response = await httpGet(`${GATE_SWAP_API_URL}?${query}`, {
    timeout: 30_000,
    headers: {
      Accept: "application/json",
      "X-DefiLlama-Api-Key": getEnv("GATESWAP_DEFILLAMA_API_KEY"),
    },
  }) as GateSwapResponse;

  if (!Array.isArray(response?.data)) throw new Error("Gate Swap API returned an invalid data payload");
  return response.data.map((row) => {
    const normalized = { ...row } as GateSwapDimensions;
    for (const field of USD_FIELDS) {
      if (row[field] === "" || row[field] === null || row[field] === undefined)
        throw new Error(`Gate Swap API returned a missing ${field} value for chain ${row.chain}`);
      const value = Number(row[field]);
      if (!Number.isFinite(value))
        throw new Error(`Gate Swap API returned an invalid ${field} value for chain ${row.chain}`);
      normalized[field] = value;
    }
    return normalized;
  });
}

export function getGateSwapChainData(options: FetchOptions): GateSwapDimensions {
  const rows = options.preFetchedResults as GateSwapDimensions[] | undefined;
  if (!Array.isArray(rows)) throw new Error("Gate Swap API prefetch results are unavailable");

  const chainId = gateSwapChainConfig[options.chain]?.chainId;
  if (!chainId) throw new Error(`Gate Swap has no API chain mapping for ${options.chain}`);
  const row = rows.find((item) => item.chain === options.chain || String(item.chainId) === chainId);
  // The API only emits chains with activity in the requested window.
  return row ?? {
    chainId,
    chain: options.chain,
    volumeUsd: 0,
    feesUsd: 0,
    userFeesUsd: 0,
    revenueUsd: 0,
    protocolRevenueUsd: 0,
    supplySideRevenueUsd: 0,
  };
}
