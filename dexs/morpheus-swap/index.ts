import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('C5XUzYLrDHiiKL7zGjLLyiQueJkQfeUyMZCcgwnVWcNr')
  },
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
  gasToken: "coingecko:fantom"
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.FANTOM],
  start: 1636106400,
}

export default adapter;
