import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.MOONRIVER]: sdk.graph.modifyEndpoint('EMTH8qnNbMGgjoFxE8YZh4qGMMxTQu44WDbn2xKexzwb'),
  // [CHAIN.CLV]: "https://clover-graph-node.huckleberry.finance/subgraphs/name/huckleberry/clv-parachain-subgraph"
}, {});
