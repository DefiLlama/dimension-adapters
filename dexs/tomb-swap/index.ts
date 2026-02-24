import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.FANTOM]: "https://graph-node.tomb.com/subgraphs/name/tombswap-subgraph",
  },
  gasToken: "coingecko:fantom"
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.FANTOM],
  start: 1632268798,
}

export default adapter;

