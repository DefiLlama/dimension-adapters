import { Adapter, DISABLED_ADAPTER_KEY, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import disabledAdapter from "../helpers/disabledAdapter";

const adapter: Adapter = {
  deadFrom: "2023-12-14",
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ERA]: {
      fetch: async (timestamp: number) => {return{timestamp}},
      start: '2023-03-31',
    },
  },
};

export default adapter;
