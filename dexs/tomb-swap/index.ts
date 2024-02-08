import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
  [CHAIN.FANTOM]: "https://graph-node.tomb.com/subgraphs/name/tombswap-subgraph",
}, {
  gasToken: "coingecko:fantom"
});

adapter.adapter.fantom.start = 1632268798;

export default adapter;
