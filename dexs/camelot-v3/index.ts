import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('7mPnp1UqmefcCycB8umy4uUkTkFxMoHn1Y7ncBUscePp'),
  [CHAIN.APECHAIN]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv3-apechain/api`,
  [CHAIN.GRAVITY]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv3-gravity/api`,
  [CHAIN.RARI]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv3-rari/api`,
  [CHAIN.REYA]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv3-reya/api`,
  [CHAIN.XDAI]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv3-xai/api`,
  [CHAIN.SANKO]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv3-sanko/api`,
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.arbitrum.start = 1680220800;
adapters.adapter.apechain.start = 1680220800;
adapters.adapter.gravity.start = 1680220800;
adapters.adapter.rari.start = 1680220800;
adapters.adapter.reya.start = 1680220800;
adapters.adapter.xdai.start = 1680220800;
adapters.adapter.sanko.start = 1680220800;
export default adapters;
