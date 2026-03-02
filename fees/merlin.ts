import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  deadFrom: "2023-12-14",
  adapter: {
    [CHAIN.ERA]: {
      fetch: async (timestamp: number) => {return{timestamp}},
      start: '2023-03-31',
    },
  },
};

export default adapter;
