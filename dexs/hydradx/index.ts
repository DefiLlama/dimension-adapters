import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.hydradx.io/defillama/v1/volume"

type IAPIResponse = {
  volume_usd: number;
}[];

const fetch = async () => {
  const response: IAPIResponse = (await fetchURL(URL));

  return {
    dailyVolume: response[0].volume_usd,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYDRADX]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-08-22',
    },
  },
};

export default adapter;
