// DEFI_APP_BUILDER_ADDRESS = '0x1922810825C90F4270048B96Da7b1803CD8609Ef';

import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";

const tsToISO = (ts: number) => new Date(ts * 1e3).toISOString();

const fetch = async (_: any, _b: any, options: any): Promise<FetchResult> => {
  // 2-day delay: Hyperliquid builder volumes are reported to DefiApp with a 2-day lag.
  const startDate = options.startOfDay - (24 * 3600);
  const endDate = options.startOfDay;

  const response = await httpGet(`https://api.defi.app/api/stats/volume-perps/between?startTime=${tsToISO(startDate)}&endTime=${tsToISO(endDate)}`, {
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": getEnv('DEFIAPP_API_KEY'),
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
