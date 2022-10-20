import { Adapter, ProtocolType } from "../../adapters/types";
import { ETHEREUM } from "../../helpers/chains";

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch: async (timestamp) => ({ timestamp, tokens: {} }),
      start: async () => 1438228800,
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
