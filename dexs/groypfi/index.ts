/**
 * GroypFi DEX Aggregator Adapter for DefiLlama (/dexs)
 *
 * Uses GroypFi's Supabase Edge Function (authoritative accounting)
 * to fetch daily swap volume in nanoTON for a given UTC range [start, end).
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const ENDPOINT =
  "https://rcuesqclhdghrqrmwjlk.supabase.co/functions/v1/swap-fee-revenue";

// Optional: if you must pass an anon key, use env (DO NOT hardcode in public repo)
const API_KEY = process.env.GROYPFI_SUPABASE_ANON_KEY;

type Resp = {
  success?: boolean;
  totalVolumeNano?: string; // nanoTON as string
  swapCount?: number;
  terminalCount?: number;
};

const fetch = async (options: FetchOptions) => {
  const startISO = new Date(options.startOfDay * 1000).toISOString();
  const endISO = new Date(options.endOfDay * 1000).toISOString();

  const res: Resp = await httpPost(
    ENDPOINT,
    { startOfDay: startISO, endOfDay: endISO },
    API_KEY
      ? {
          headers: {
            "content-type": "application/json",
            apikey: API_KEY,
          },
        }
      : {
          headers: {
            "content-type": "application/json",
          },
        }
  );

  if (!res || typeof res.totalVolumeNano !== "string") {
    throw new Error("GroypFi: invalid response (missing totalVolumeNano)");
  }

  // Convert nanoTON -> TON number
  // NOTE: Dex adapters typically return USD volume. We convert TON->USD via DefiLlama pricing helpers.
  // If your framework doesn't support getUSDValue, replace with createBalances + return token volume (depends on repo conventions).
  const volumeNano = BigInt(res.totalVolumeNano);

  // Most DefiLlama dex adapters return USD volume:
  // getUSDValue(chain, amountInNativeSmallestUnitAsString)
  const dailyVolume = options.getUSDValue(CHAIN.TON, volumeNano.toString());

  const dailySwapCount = (res.swapCount ?? 0) + (res.terminalCount ?? 0);

  return {
    dailyVolume,
    dailySwapCount,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: 1735689600, // 2025-01-01 UTC (adjust if needed)
    },
  },
};

export default adapter;
