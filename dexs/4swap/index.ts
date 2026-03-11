import fetchURL from "../../utils/fetchURL"
import { type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://safe-swap-api.pando.im/api/pairs"

interface IAPIResponse {
  volume_24h: string;
};

const fetch = async () => {
  const response: IAPIResponse[] = (await fetchURL(URL))?.data.pairs;
  const dailyVolume = response
    .reduce((acc, { volume_24h }) => acc + Number(volume_24h), 0);

  return {
    dailyVolume
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MIXIN]: {
      fetch,
      runAtCurrTime: true,
    },
  }
};

export default adapter;
