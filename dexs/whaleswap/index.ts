import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: getUniV2LogAdapter({ factory: '0xabc26f8364cc0dd728ac5c23fa40886fda3dd121'}),
      start: '2021-10-28',
    },
    [CHAIN.FANTOM]: {
      fetch: getUniV2LogAdapter({ factory: '0xabc26f8364cc0dd728ac5c23fa40886fda3dd121'}),
      start: '2021-11-25',
    },
  },
};

export default adapter;
