import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('FKEt2N5VmSdEYcz7fYLPvvnyEUkReQ7rvmXzs6tiKCz1')
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
  dayData: "dayData",
  dailyVolume: "dailyVolumeUSD",
  dailyVolumeTimestampField: "date"
});

adapters.adapter.bsc.start = 1672790400;
export default adapters;
