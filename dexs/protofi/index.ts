import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('6D3HgYNegniVRGGF1cceiZ6Kg3KWGNzQCqjWMtZu7wTQ'),
  },
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
  gasToken : "coingecko:fantom"
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.FANTOM],
}

export default adapter;