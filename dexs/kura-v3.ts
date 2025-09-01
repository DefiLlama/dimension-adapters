// import { uniV3Exports } from "../helpers/uniswap";

// export default uniV3Exports({ 
//   sei: {
//     factory: '0xd0c54c480fD00DDa4DF1BbE041A6881f2F09111e',
//   }
// })


import { univ2Adapter2 } from "../helpers/getUniSubgraphVolume";
import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.SEI]: "https://api.goldsky.com/api/public/project_cm9ghm7cnxuaa01x5g6pfchp7/subgraphs/sei/2/gn"
  },
  factoriesName: 'clFactories',
  totalFeesField: 'totalFeesUSD'
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SEI],
}

export default adapter
