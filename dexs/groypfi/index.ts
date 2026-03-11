import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const ENDPOINT = "https://rcuesqclhdghrqrmwjlk.supabase.co/functions/v1/swap-fee-revenue";

type Resp = {
  totalVolumeNano?: string; // nanoTON string
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const start = options.startTimestamp;
  const end = options.endTimestamp;

  const startISO = new Date(start * 1000).toISOString();
  const endISO = new Date(end * 1000).toISOString();

  const res: Resp = await httpPost(ENDPOINT, { startOfDay: startISO, endOfDay: endISO });

  if (!res || typeof res.totalVolumeNano !== "string") {
    throw new Error("GroypFi dexs: invalid response (missing totalVolumeNano)");
  }

  dailyVolume.addCGToken('the-open-network', Number(res.totalVolumeNano) / 1e9);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2025-01-01',
    },
  },
};

export default adapter;
