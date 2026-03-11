import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (timestamp: number) => {
  const url = `https://api.pearprotocol.io/v1/metric?timestamp=${timestamp}`;
  const response = await fetchURL(url);
  const dailyVolume = response.payload.dailyVolume;
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-05-08'
};

export default adapter;
