import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    avax: sdk.graph.modifyEndpoint(
      "CPXTDcwh6tVP88QvFWW7pdvZJsCN4hSnfMmYeF1sxCLq",
    ),
  },
  factoriesName: "pangolinFactories",
  totalVolume: "totalVolumeUSD",
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.AVAX],
  start: '2022-01-21'
}

export default adapter
