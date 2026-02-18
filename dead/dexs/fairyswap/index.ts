import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";


const adapter: SimpleAdapter = {
  deadFrom: '2023-09-12',
  version: 2,
  adapter: {
    [CHAIN.FINDORA]: {
      fetch: getUniV2LogAdapter({ factory: '0xA9a6E17a05c71BFe168CA972368F4b98774BF6C3' }),
    },
  },
};

export default adapter;
