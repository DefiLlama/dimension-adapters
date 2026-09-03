import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../chains";
import { httpGet } from "../../utils/fetchURL";

/*
Allbridge Next (https://next.allbridge.io) is a cross-chain swap aggregator: transfers are settled by
intent-based liquidity providers through per-transfer deposit addresses, so there are no Allbridge
contracts on the source or destination chains to read events from. Daily volume and fees come from
the Allbridge Next public stats API (GET /stats/daily, documented at https://api.next.allbridge.io/docs),
which aggregates the transfers indexed on-chain by Allbridge.
*/

const API_URL = "https://api.next.allbridge.io/stats/daily";

export const ALLBRIDGE_NEXT_START = "2026-04-17"; // first Allbridge Next transfer

export type AllbridgeNextChainConfig = {
  chainId: string; // Allbridge Next chain symbol (source chain of the transfer)
  start: string;
};

// DefiLlama chain -> Allbridge Next chain symbol
export const allbridgeNextChainConfig: Record<string, AllbridgeNextChainConfig> = {
  [CHAIN.ETHEREUM]: { chainId: "ETH", start: ALLBRIDGE_NEXT_START },
  [CHAIN.ARBITRUM]: { chainId: "ARB", start: ALLBRIDGE_NEXT_START },
  [CHAIN.BSC]: { chainId: "BSC", start: ALLBRIDGE_NEXT_START },
  [CHAIN.BASE]: { chainId: "BAS", start: ALLBRIDGE_NEXT_START },
  [CHAIN.POLYGON]: { chainId: "POL", start: ALLBRIDGE_NEXT_START },
  [CHAIN.TRON]: { chainId: "TRX", start: ALLBRIDGE_NEXT_START },
  [CHAIN.SOLANA]: { chainId: "SOL", start: ALLBRIDGE_NEXT_START },
  [CHAIN.STELLAR]: { chainId: "SRB", start: ALLBRIDGE_NEXT_START },
  [CHAIN.TON]: { chainId: "TON", start: ALLBRIDGE_NEXT_START },
  [CHAIN.XLAYER]: { chainId: "OKX", start: ALLBRIDGE_NEXT_START },
};

export type AllbridgeNextDailyStat = {
  date: string; // YYYY-MM-DD, UTC day of the send transaction
  sourceChain: string; // Allbridge chain symbol
  volumeUsd: string; // USD value of successful transfers sent that day
  feesUsd: string; // Allbridge fees in USD collected on those transfers
  transfers: number;
};

// One request per day for all chains; fetch() then picks its own chain from the rows.
export const fetchAllbridgeNextDailyStats = async (options: FetchOptions): Promise<AllbridgeNextDailyStat[]> => {
  const res = await httpGet(`${API_URL}?from=${options.dateString}&to=${options.dateString}`);
  return res.data as AllbridgeNextDailyStat[];
};

// The framework types prefetch results as a dimension record, while this API returns rows;
// the rows are handed back to fetch() through options.preFetchedResults unchanged.
export const prefetchAllbridgeNextDailyStats: FetchV2 = async (options: FetchOptions) => {
  const rows = await fetchAllbridgeNextDailyStats(options);
  return rows as unknown as FetchResultV2;
};

export const getAllbridgeNextDailyStats = (options: FetchOptions) => {
  const stats = (options.preFetchedResults ?? []) as AllbridgeNextDailyStat[];
  const { chainId } = allbridgeNextChainConfig[options.chain];
  const rows = stats.filter((row) => row.sourceChain === chainId && row.date === options.dateString);
  return {
    volumeUsd: rows.reduce((sum, row) => sum + Number(row.volumeUsd), 0),
    feesUsd: rows.reduce((sum, row) => sum + Number(row.feesUsd), 0),
  };
};
