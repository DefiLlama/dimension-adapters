import * as sdk from "@defillama/sdk";
// https://api.thegraph.com/subgraphs/name/stellaswap/pulsar
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('85R1ZetugVABa7BiqKFqE2MewRuJ8b2SaLHffyTHDAht')
  },
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.MOONBEAM],
  start: 1672876800,
}

export default adapter;
