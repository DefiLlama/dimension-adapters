import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('3CpYKjaYzYk34muKEjBkDmWJLUMdAL6FEeKtLvYUbAuH'),
}, {
  factoriesName: "factories",
  totalVolume: "volumeUSD",
  dayData: "dayData",
  dailyVolume: "volumeUSD"
});
