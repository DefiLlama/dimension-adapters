import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from '../../helpers/chains';
import { postURL } from "../../utils/fetchURL"


const fetch = async ({dateString}: FetchOptions): Promise<FetchResultV2> => {
  const response = await postURL('https://api.rate-x.io', {
    serverName: "AdminSvr",
    method: "querySumVolumeSymbolDay",
    content: {
      trade_date: dateString
    }
  });

  const dailyVolume = Number(response.data.trade_u_volume);

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-11-07',
    },
  }
};

export default adapter;