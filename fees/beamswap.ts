import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const getUniV2LogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 0.13/0.30,
  protocolRevenueRatio: 0.13/0.30,
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.MOONBEAM]: {
      fetch: getUniV2LogAdapter({ factory: '0x985BcA32293A7A496300a48081947321177a86FD', ...getUniV2LogAdapterConfig })
    },
  },
};

export default adapter;
