import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('56dMe6VDoxCisTvkgXw8an3aQbGR8oGhR292hSu6Rh3K')
}, {
    factoriesName: "pyeFactories",
    dayData: "pyeDayData",
});
adapter.adapter.bsc.start = 1660893036;
export default adapter;
