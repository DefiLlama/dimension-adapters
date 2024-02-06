import { Adapter, } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/compoundV2";

const unitroller = "0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4";

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: getFeesExport(unitroller),
      start: 1664582400,
    },
  },
};

export default adapter;
