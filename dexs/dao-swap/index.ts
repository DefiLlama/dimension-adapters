import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adpters = univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('7APt1aJ4g5VJqcKF47if3kDjsNSG8mHPGv9YSt8Qf39i')
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});
adpters.adapter.bsc.start = 1663921255;
export default adpters;
