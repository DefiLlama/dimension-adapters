import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('Hnjf3ipVMCkQze3jmHp8tpSMgPmtPnXBR38iM4ix1cLt')
  },
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: '2023-04-13'
}

export default adapter;
