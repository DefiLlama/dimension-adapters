import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('GH4Zt29mCApHwMfavNFw5ZdQDH3owc2Wq8DdU4hGPXYe'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('EcLNjgAFADeXVopmhv3HY79fayzXRtK8R9imZNopRBpE'),
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('6J4fEY6pSRsqaqDbHn17HJY1viPzrGc1pjCqBKrrQXPC'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AGyZUDiBcG9GkW9GX6vXPkuTj5kjf1S6aznEks6PVpi')
  // [CHAIN.TELOS]: "https://telos.apeswapgraphs.com/subgraphs/name/ape-swap/apeswap-graph"
}, {});

adapters.adapter.bsc.start = 1613273226;
adapters.adapter.polygon.start = 1623814026;
adapters.adapter.ethereum.start = 1652239626;
// adapters.adapter.telos.start = 1665880589;
adapters.adapter.arbitrum.start = 1678406400;

export default adapters;
