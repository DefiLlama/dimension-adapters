import { FetchOptions } from "../../adapters/types";
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

// DefiLlama chain -> Allbridge Next chain symbol (source chain of the transfer)
export const ALLBRIDGE_NEXT_CHAINS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "ETH",
  [CHAIN.ARBITRUM]: "ARB",
  [CHAIN.BSC]: "BSC",
  [CHAIN.BASE]: "BAS",
  [CHAIN.POLYGON]: "POL",
  [CHAIN.TRON]: "TRX",
  [CHAIN.SOLANA]: "SOL",
  [CHAIN.STELLAR]: "SRB",
  [CHAIN.TON]: "TON",
  [CHAIN.XLAYER]: "OKX",
};

export type AllbridgeNextDailyStat = {
  date: string; // YYYY-MM-DD, UTC day of the send transaction
  sourceChain: string; // Allbridge chain symbol
  volumeUsd: string; // USD value of successful transfers sent that day
  feesUsd: string; // Allbridge fees in USD collected on those transfers
  transfers: number;
};

// One request per day for all chains; fetch() then picks its own chain from the rows.
export const prefetchAllbridgeNextDailyStats = async (options: FetchOptions) => {
  const res = await httpGet(`${API_URL}?from=${options.dateString}&to=${options.dateString}`);
  return res.data as AllbridgeNextDailyStat[] as any;
};

export const getAllbridgeNextDailyStats = (options: FetchOptions) => {
  const stats: AllbridgeNextDailyStat[] = options.preFetchedResults ?? [];
  const chain = ALLBRIDGE_NEXT_CHAINS[options.chain];
  const rows = stats.filter((row) => row.sourceChain === chain && row.date === options.dateString);
  return {
    volumeUsd: rows.reduce((sum, row) => sum + Number(row.volumeUsd), 0),
    feesUsd: rows.reduce((sum, row) => sum + Number(row.feesUsd), 0),
  };
};
