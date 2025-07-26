import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const tsToISO = (ts: number) => new Date(ts * 1e3).toISOString();

const fetch = async (_: any, _b: any, options: any): Promise<FetchResult> => {
  const startDate = options.startOfDay - (24 * 3600);
  const endDate = options.startOfDay;
  console.log(startDate, endDate, options.startOfDay, options.startTimestamp);

  const response = await httpGet(`https://api.defi.app/api/stats/volume-perps/between?startTime=${tsToISO(startDate)}&endTime=${tsToISO(endDate)}`, {
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": process.env.DEFIAPP_API_KEY,
      User: "defillama",
    },
  });
  const dailyVolume = response.totalPerpsVolumeUsd;

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
  doublecounted: true,
};

export default adapter;
