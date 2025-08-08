import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.TOMBCHAIN]: "https://graph-node.lif3.com/subgraphs/name/lifeswap"
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.TOMBCHAIN],
}

export default adapter;