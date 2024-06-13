import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('oM4WnuyAbSwPpjk6niUkp88AZg1hSTi9aC1ZM4RcsqR')
}, {
  factoriesName: "factories",
  dayData: "uniswapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.avax.start = 1702339200;
export default adapters;
