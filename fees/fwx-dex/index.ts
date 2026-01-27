import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { Adapter } from "../../adapters/types";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: getUniV2LogAdapter({
        factory: "0x2131Bdb0E0B451BC1C5A53F2cBC80B16D43634Fa",
        fees: 0.001,
      }),
      start: '2024-06-06',
    },
    [CHAIN.BASE]: {
      fetch: getUniV2LogAdapter({
        factory: "0x3512DA8F30D9AE6528e8e0787663C14Fe263Fbea",
        fees: 0.0025,
      }),
      start: '2024-09-04',
    },
  },
};

export default adapter;
