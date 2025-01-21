import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.EVMOS]: {
      fetch: getUniV3LogAdapter({ factory: '0xf544365e7065966f190155F629cE0182fC68Eaa2' }),
      start: '2023-04-03',
    },
  },
};

export default adapter;
