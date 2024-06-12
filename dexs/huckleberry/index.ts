import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.MOONRIVER]: "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/EMTH8qnNbMGgjoFxE8YZh4qGMMxTQu44WDbn2xKexzwb",
  // [CHAIN.CLV]: "https://clover-graph-node.huckleberry.finance/subgraphs/name/huckleberry/clv-parachain-subgraph"
}, {});
