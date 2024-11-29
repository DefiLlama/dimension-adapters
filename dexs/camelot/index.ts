import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('8zagLSufxk5cVhzkzai3tyABwJh53zxn9tmUYJcJxijG'),
    [CHAIN.APECHAIN]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv2-apechain/api`,
    [CHAIN.GRAVITY]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv2-gravity/api`,
    [CHAIN.RARI]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv2-rari/api`,
    [CHAIN.REYA]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv2-reya/api`,
    [CHAIN.XDAI]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv2-xai/api`,
    [CHAIN.SANKO]: `https://subgraph.satsuma-prod.com/${process.env.CAMELOT_API_KEY}/camelot/camelot-ammv2-sanko/api`,
}, {});

adapters.adapter.arbitrum.start = 1668124800;
export default adapters;
