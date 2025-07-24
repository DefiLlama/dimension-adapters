import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const tsToISO = (ts: number) => new Date(ts * 1e3).toISOString();

interface IDefiAppResponse {
  startTime: string;
  endTime: string;
  totalPerpsVolumeUsd: string;
}

type IRequest = {
  [key: string]: Promise<any>;
};
const requests: IRequest = {};

export async function fetchCacheURL(url: string) {
  const key = url;
  if (!requests[key]) {
    requests[key] = httpGet(url, {
      headers: {
        "Content-Type": "application/json",
        // DefiLlama team to configure
        "X-API-KEY": process.env.DEFIAPP_API_KEY,
        User: "defillama",
      },
    });
  }
  return requests[key];
}

const fetch = async (_: any, _b: any, options: any): Promise<FetchResult> => {
  const { endTimestamp, startTimestamp } = options;
  const dayResponse = <IDefiAppResponse>(
    await fetchCacheURL(
      `https://api.defi.app/api/stats/volume-perps/between?startTime=${tsToISO(
        startTimestamp
      )}&endTime=${tsToISO(endTimestamp)}`
    )
  );
  const dailyVolume = dayResponse.totalPerpsVolumeUsd;
  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-05-01", // May 1st, 2025
    },
  },
};

export default adapter;
