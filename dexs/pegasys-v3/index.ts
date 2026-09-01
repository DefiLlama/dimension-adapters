import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  skipBreakdownValidation: true,
  pullHourly: true,
  adapter: {
    [CHAIN.ROLLUX]: {
      fetch: getUniV3LogAdapter({ factory: '0xeAa20BEA58979386A7d37BAeb4C1522892c74640' }),
      start: '2023-06-30',
    },
  },
};

export default adapter;
