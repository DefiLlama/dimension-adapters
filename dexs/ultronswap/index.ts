import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.ULTRON]: "https://graph-node.ultron-dev.net/subgraphs/name/root/ultronswap-exchange"
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ULTRON],
  start: 1659323793,
}

export default adapter;