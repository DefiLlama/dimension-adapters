import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.DOGECHAIN]: "https://graph.yodeswap.dog/subgraphs/name/yodeswap"
  },
});

const adapter: SimpleAdapter = {
  fetch: async () => {return {}},
  chains: [CHAIN.DOGECHAIN],
  start: 1630000000,
}

export default adapter;
