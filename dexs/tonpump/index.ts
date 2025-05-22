import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const endpoint = "https://tonfunstats-eqnd7.ondigitalocean.app/api/v1/getVolume"

const fetch = async (options: FetchOptions) => {
  const res = await fetchURL(`${endpoint}?from=${options.startTimestamp}&to=${options.endTimestamp}&service=hot`)
  const dailyVolume = options.createBalances()
  dailyVolume.addCGToken('the-open-network', res.volume / 1e9)

  return { dailyVolume, }
};


const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2024-10-24',
    },
  },
};

export default adapter;
