import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.CRONOS_ZKEVM]: "https://api.goldsky.com/api/public/project_clwrfupe2elf301wlhnd7bvva/subgraphs/h2-exchange-v2-cronos-zkevm/latest/gn"
  },
  factoriesName: 'vvsFactories',
  totalVolume: 'totalVolumeUSD',
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CRONOS_ZKEVM],
  start: '2024-08-14'
}

export default adapter
