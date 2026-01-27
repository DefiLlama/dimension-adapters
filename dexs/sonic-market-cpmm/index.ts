import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.SONIC]: "https://subgraph.satsuma-prod.com/f6a8c4889b7b/clober/cpmm-v2-subgraph-sonic-mainnet/api"
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SONIC],
}

export default adapter;