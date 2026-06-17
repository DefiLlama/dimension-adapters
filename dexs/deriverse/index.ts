import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_URL = "https://vol.mainnet.deriverse.io/volumes";
const MARKET = "all";

interface VolumeResponse {
  period?: string;
  market?: string;
  totals?: {
    usd?: number | null;
  };
  coverage?: {
    totalRows?: number;
    rawOnlyRows?: number;
    usdComplete?: boolean;
  };
}

const fetch = async (options: FetchOptions) => {
  const response: VolumeResponse = await httpGet(`${API_URL}?period=day&date=${options.dateString}&market=${MARKET}`);

  if (response.period !== "day" || response.market !== MARKET) {
    throw new Error(`Unexpected Deriverse volume API response for ${options.dateString}`);
  }

  if (response.coverage && response.coverage.usdComplete === false) {
    throw new Error(`Deriverse volume API has ${response.coverage.rawOnlyRows ?? "some"} rows without USD coverage`);
  }

  const dailyVolume = response.totals?.usd;
  if (dailyVolume === null || dailyVolume === undefined) {
    if (response.coverage?.totalRows === 0) return { dailyVolume: 0 };
    throw new Error(`Deriverse volume API did not return USD volume for ${options.dateString}`);
  }

  if (!Number.isFinite(dailyVolume)) {
    throw new Error(`Invalid Deriverse daily volume for ${options.dateString}`);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-04-27",
  methodology: {
    Volume: "Daily spot and perpetual trading volume reported by the Deriverse hosted volume API.",
  },
};

export default adapter;
