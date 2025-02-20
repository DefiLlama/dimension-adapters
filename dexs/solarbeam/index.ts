import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter2({
    [CHAIN.MOONRIVER]: sdk.graph.modifyEndpoint('71vx2Ph76RyX8y7RRqzNKToMm4w6now3YBJjAWpGyUCP')
},{
});
adapter.adapter.moonriver.start = 1630903340;
export default adapter;
