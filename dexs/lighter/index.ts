import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (timestamp: number) => {
  return {
    dailyVolume: '0',
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  deadFrom: '2024-03-04',
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-03-04',
    },
  },
};
export default adapter;
