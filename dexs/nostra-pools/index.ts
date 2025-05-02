import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";

async function fetch() {
  const data = await fetchURL("https://api.nostra.finance/query/pool_aprs");
  const dailyVolume = Object.values(data).reduce((acc: number, pool: any) => {
    return acc + Number(pool.volume);
  }, 0);

  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.STARKNET]: {
      fetch,
      start: '2024-06-13',
    },
  },
};

export default adapter;
