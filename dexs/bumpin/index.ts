import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const url = `https://api.bumpin.trade/bapi/statistics?endTimestamp=${timestamp}`;
  
  const response = await httpGet(url);
  const dailyVolume = Number(response.dailyVolumeUsd);


  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-01-01',
    },
  },
};

export default adapter;

