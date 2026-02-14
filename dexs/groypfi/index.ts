import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

const ENDPOINT =
  "https://rcuesqclhdghrqrmwjlk.supabase.co/functions/v1/swap-fee-revenue";

const TON_API = "https://tonapi.io/v2";

// Optional (don’t hardcode in public repo)
const API_KEY = process.env.GROYPFI_SUPABASE_ANON_KEY;

type Resp = {
  totalVolumeNano?: string; // nanoTON string
};

const fetch = async (options: FetchOptions) => {
  const start = options.startTimestamp;
  const end = options.endTimestamp;

  const startISO = new Date(start * 1000).toISOString();
  const endISO = new Date(end * 1000).toISOString();

  const res: Resp = await httpPost(
    ENDPOINT,
    { startOfDay: startISO, endOfDay: endISO },
    {
      headers: {
        "content-type": "application/json",
        ...(API_KEY ? { apikey: API_KEY } : {}),
      },
    }
  );

  if (!res || typeof res.totalVolumeNano !== "string") {
    throw new Error("GroypFi dexs: invalid response (missing totalVolumeNano)");
  }

  const volumeNano = BigInt(res.totalVolumeNano);

  // Convert nanoTON -> TON -> USD using TonAPI price
  const rates: any = await httpGet(`${TON_API}/rates?tokens=ton&currencies=usd`);
  const tonPriceUSD = rates?.rates?.TON?.prices?.USD ?? 0;

  const volumeTON = Number(volumeNano) / 1e9;
  const dailyVolume = volumeTON * tonPriceUSD;

  return { dailyVolume };
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
