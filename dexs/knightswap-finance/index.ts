import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: getUniV2LogAdapter({ factory: '0xf0bc2E21a76513aa7CC2730C7A1D6deE0790751f'}),
      start: '2021-10-28',
    },
    [CHAIN.FANTOM]: {
      fetch: getUniV2LogAdapter({ factory: '0x7d82F56ea0820A9d42b01C3C28F1997721732218'}),
      start: '2021-11-25',
    },
  },
};

export default adapter;
