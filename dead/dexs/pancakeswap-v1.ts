import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: SimpleAdapter = {
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.BSC]: {
      fetch: async (_t: any, _a: any, { startTimestamp }: any) => {
        return {
          totalVolume: 103394400000,
          timestamp: startTimestamp
        }
      },
      start: '2023-04-01',
    }
  },
  deadFrom: '2023-07-03',
}

export default adapter;
