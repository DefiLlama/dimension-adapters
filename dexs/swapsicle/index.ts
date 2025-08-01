import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.AVAX]: sdk.graph.modifyEndpoint('3CpYKjaYzYk34muKEjBkDmWJLUMdAL6FEeKtLvYUbAuH'),
  },
  factoriesName: "factories",
  totalVolume: "volumeUSD",
  dayData: "dayData",
  dailyVolume: "volumeUSD"
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.AVAX],
}

export default adapter;