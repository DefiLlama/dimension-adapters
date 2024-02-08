import { Adapter,  } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/compoundV2";

const unitroller = "0xfD36E2c2a6789Db23113685031d7F16329158384";

const adapter: Adapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: getFeesExport(unitroller),
      start: 1691798400,
    },
  },
};

export default adapter;
