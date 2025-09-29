/* import { uniV2Exports } from "../helpers/uniswap";

export default uniV2Exports({ 
  sei: {
    factory: '0xAEbdA18889D6412E237e465cA25F5F346672A2eC',
  }
}) */

import { univ2Adapter2 } from "../helpers/getUniSubgraphVolume";
import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.SEI]: "https://api.goldsky.com/api/public/project_cm9ghm7cnxuaa01x5g6pfchp7/subgraphs/sei/2/gn"
  },
  factoriesName: 'legacyFactories',
  totalFeesField: 'totalFeeUSD'
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SEI],
}

export default adapter
