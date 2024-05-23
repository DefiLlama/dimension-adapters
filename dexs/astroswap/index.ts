import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.VELAS]: "https://thegraph2.astroswap.app/subgraphs/name/astro"
}, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
});


adapters.adapter.velas.start = 1643414400;
adapters.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
export default adapters;
