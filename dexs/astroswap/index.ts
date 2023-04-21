import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.VELAS]: "https://thegraph2.astroswap.app/subgraphs/name/astro"
}, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
});


adapters.adapter.velas.start = async () => 1643414400;
export default adapters;
