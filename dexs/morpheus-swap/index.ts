import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('C5XUzYLrDHiiKL7zGjLLyiQueJkQfeUyMZCcgwnVWcNr')
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
  gasToken: "coingecko:fantom"
});

adapters.adapter.fantom.start = 1636106400;
export default adapters;
