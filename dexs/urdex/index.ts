import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const volumeEndpoint = "https://api.urdex.finance/kol/getVolumeData"

const fetch = async (options: FetchOptions) => {
  const volumeData = (await fetchURL(`${volumeEndpoint}?date=${options.startOfDay}`)).data;
  return {
    dailyVolume: volumeData.daily.TotalTradingVolume ? `${volumeData.daily.TotalTradingVolume}` : '0',
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-12-01',
};

export default adapter;
