import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.CELO]: sdk.graph.modifyEndpoint('JWDRLCwj4H945xEkbB6eocBSZcYnibqcJPJ8h9davFi')
  },
  factoriesName: "ubeswapFactories",
  dayData: "ubeswapDayData",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.CELO],
  start: 1614574153,
}

export default adapter;
