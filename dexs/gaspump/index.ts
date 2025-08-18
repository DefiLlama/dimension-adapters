import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { getPrices } from "../../utils/prices";


const endpoint = "https://api.gas111.com/api/v1/internal/tokens/volume-stats?"


const fetch = async (options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split(".")[0]
  const endTime = new Date(options.endTimestamp * 1000).toISOString().split(".")[0]
  const res = await fetchURL(`${endpoint}start_date=${startTime}&end_date=${endTime}`)
  const TON = "coingecko:the-open-network"
  const ton_price = await getPrices([TON], options.startTimestamp);

  return {
    dailyVolume: parseInt(res.volume_ton) * ton_price[TON].price,
    timestamp: options.startTimestamp,
  };
};


const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2024-08-31',
    },
  },
};

export default adapter;
