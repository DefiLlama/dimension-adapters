import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.METER]: {
      fetch: getUniV2LogAdapter({ factory: '0xb33dE8C0843F90655ad6249F20B473a627443d21', revenueRatio: 1, protocolRevenueRatio: 0, holderRevenueRatio: 1 }),
    }
  },
};

export default adapter;
