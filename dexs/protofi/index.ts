import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('6D3HgYNegniVRGGF1cceiZ6Kg3KWGNzQCqjWMtZu7wTQ'),
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
  gasToken : "coingecko:fantom"
});
