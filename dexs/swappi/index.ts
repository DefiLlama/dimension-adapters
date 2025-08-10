import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.CONFLUX]: "https://graphql.swappi.io/subgraphs/name/swappi-dex/swappi"
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.CONFLUX],
}

export default adapter;