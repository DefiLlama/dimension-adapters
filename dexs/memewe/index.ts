import { CHAIN } from "../../helpers/chains";
import type { FetchV2, Adapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const api = "https://backend.memewe.club/trade/stats/volume";

const fetch: FetchV2 = async ({ chain, startTimestamp, ...restOpts }) => {
  const end = restOpts.toTimestamp;
  const url = `${api}/${end}`;
  const volume = Number(await httpGet(url));
  const dailyVolume = restOpts.createBalances();
  dailyVolume.addGasToken(volume || 0);
  return {
    dailyVolume,
    timestamp: restOpts.startOfDay,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      start: "2024-11-28",
      fetch,
    },
  },
};

export default adapter;
