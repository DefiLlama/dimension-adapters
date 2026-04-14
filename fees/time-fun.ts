import { Adapter, } from "../adapters/types";
import { getFeesExport } from "../helpers/time-fun";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFeesExport('0x428aeF7fB31E4E86162D62d4530a4dd7232D953D'),
      start: '2024-06-13',
    },
  },
  version: 2,
  methodology: {
    Fees: "Fees paid by users while trading on social network.",
    Revenue: "Fees paid by users while trading on social network.",
  }
}

export default adapter;
