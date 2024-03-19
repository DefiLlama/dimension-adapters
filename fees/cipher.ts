import { Adapter,} from "../adapters/types";
import { getFeesExport } from "../helpers/friend-tech";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFeesExport('0x2544a6412bc5aec279ea0f8d017fb4a9b6673dca'),
      start: 1695600000,
    },
  },
  version: 2,
}

export default adapter;
