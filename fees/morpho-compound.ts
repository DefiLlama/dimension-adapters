import { Adapter, } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/compoundV2";

const unitroller = "0x930f1b46e1d081ec1524efd95752be3ece51ef67";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: getFeesExport(unitroller),
      start: 1697932800,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
