import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.SEI]: "https://gateway.thegraph.com/api/d597bdace505e8fe54ce5471c803f24d/subgraphs/id/3J7Ry3oVQhhCmfEMpCwqa1aMtEmt66dU9fUuR31DTvx1"
}, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
});


adapters.adapter.sei.start = 1719432193;
export default adapters;