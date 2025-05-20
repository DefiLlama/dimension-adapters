import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

const fetch = async (timestamp: number) => {
  return {
    dailyVolume: '0',
    totalVolume: '4913817761.861917',
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  deadFrom: '2024-03-04',
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-03-04',
    },
  },
};
export default adapter;
