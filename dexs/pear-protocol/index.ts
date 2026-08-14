import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const url = `https://api.pearprotocol.io/v1/metric?timestamp=${options.toTimestamp}`;
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
