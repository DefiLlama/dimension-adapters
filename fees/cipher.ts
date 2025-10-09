import { Adapter, } from "../adapters/types";
import { getFeesExport } from "../helpers/friend-tech";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFeesExport('0x2544a6412bc5aec279ea0f8d017fb4a9b6673dca'),
      start: '2023-09-25',
    },
  },
  version: 2,
  methodology: {
    Fees: "Fees paid by users while trading on social network.",
    Revenue: "Fees paid by users while trading on social network.",
  }
}

export default adapter;
