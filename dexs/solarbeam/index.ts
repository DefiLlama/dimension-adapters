import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
    [CHAIN.MOONRIVER]: "https://api.thegraph.com/subgraphs/name/solarbeamio/amm-v2"
},{
    hasTotalVolume: false,
});
adapter.adapter.moonriver.start = 1630903340;
export default adapter;
