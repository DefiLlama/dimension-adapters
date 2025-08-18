import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('BoHp9H2rGzVFPiqc56PJ1Gw7EPDaiHMcupsUuksMGp2K')
  },
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: '2024-11-18'
}

export default adapter;
