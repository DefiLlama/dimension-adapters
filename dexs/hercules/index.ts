// https://metisapi.0xgraph.xyz/subgraphs/name/amm-subgraph-andromeda/
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/amm-subgraph-andromeda/"
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.METIS],
  fetch,
  start: 1710115200,
}

export default adapter;
