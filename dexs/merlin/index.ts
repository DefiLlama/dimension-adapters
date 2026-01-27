import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.ERA]: "https://api.studio.thegraph.com/query/45654/merlin-subgraph/v0.1.0"
  },
});

const adapter: SimpleAdapter = {
  deadFrom: '2023-04-25',
  chains: [CHAIN.ERA],
  fetch,
  start: 1680274800,
}

export default adapter;
