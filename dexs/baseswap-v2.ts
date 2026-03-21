import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getUniV2LogAdapter({ factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB', revenueRatio: 0 }),
      start: '2023-07-28',
    },
  },
};

export default adapter;
