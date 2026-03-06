import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

async function fetch(options: FetchOptions) {
  if (options.startOfDay > 1742644800) return {}
  return getUniV3LogAdapter({
    factory: "0xf544365e7065966f190155F629cE0182fC68Eaa2",
  })
}

const adapter: Adapter = {
  version: 2,
  deadFrom: "2025-03-22",
  adapter: {
    [CHAIN.EVMOS]: {
      fetch,
      start: '2023-04-03',
    },
  },
};

export default adapter;
