import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: getUniV2LogAdapter({ factory: '0xB581D0A3b7Ea5cDc029260e989f768Ae167Ef39B'}),
    },
    [CHAIN.BSC]: {
      fetch: getUniV2LogAdapter({ factory: '0x98957ab49b8bc9f7ddbCfD8BcC83728085ecb238'}),
    },
    [CHAIN.AVAX]: {
      fetch: getUniV2LogAdapter({ factory: '0xa0fbfda09b8815dd42ddc70e4f9fe794257cd9b6'}),
    },
  },
};

export default adapter;
