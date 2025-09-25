import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.AVAX]: sdk.graph.modifyEndpoint('NFHumrUD9wtBRnZnrvkQksZzKpic26uMM5RbZR56Gns')
  },
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.AVAX],
  start: '2023-12-12'
}

export default adapter;
