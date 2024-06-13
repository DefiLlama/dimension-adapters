import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.CELO]: sdk.graph.modifyEndpoint('JWDRLCwj4H945xEkbB6eocBSZcYnibqcJPJ8h9davFi')
}, {
  factoriesName: "ubeswapFactories",
  dayData: "ubeswapDayData",
});
adapters.adapter.celo.start = 1614574153;

export default adapters;
