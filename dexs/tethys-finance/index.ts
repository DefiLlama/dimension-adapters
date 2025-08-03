import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.METIS]: "https://graph-node.tethys.finance/subgraphs/name/tethys2"
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.METIS],
}

export default adapter;