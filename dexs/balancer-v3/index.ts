import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {}
};

const v3ChainMapping: any = {
  [CHAIN.ETHEREUM]: 'MAINNET',
  [CHAIN.XDAI]: 'GNOSIS',
}

Object.keys(v3ChainMapping).forEach((chain: any) => {
  adapter.adapter[chain] = { fetch, 
    runAtCurrTime: true, 
    meta: { 
      methodology: { 
          Volume: 'Total volume is the sum of all trades in the last 24 hours.',
          Fees: 'Total fees earned from all the trades and yield in the last 24 hours.',
          Revenue: 'Total revenue earned by the protocol in the last 24 hours, which is 50% of the trade fees and 10% of the yield capture.',
      } 
    } 
  }
})

// chains = ["MAINNET", "ARBITRUM", "AVALANCHE", "BASE", "GNOSIS", "POLYGON", "ZKEVM", "OPTIMISM", "MODE", "FRAXTAL"]

async function fetch({ createBalances, chain}: FetchOptions) {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const query = `query {
  pools: poolGetPools(
    orderBy: volume24h
    orderDirection: desc
    where: { chainIn: [${v3ChainMapping[chain]}] protocolVersionIn: [3]}
  ) {
    address
    chain
    createTime
    decimals
    protocolVersion
    tags
    dynamicData {
      totalLiquidity
      lifetimeVolume
      lifetimeSwapFees
      volume24h
      fees24h
      yieldCapture24h
    }
  }
}` 
  const { pools } = await request('https://api-v3.balancer.fi/graphql', query);
  pools.forEach((pool: any) => {
    dailyFees.addUSDValue(+pool.dynamicData.fees24h)
    dailyFees.addUSDValue(+pool.dynamicData.yieldCapture24h)
    dailyVolume.addUSDValue(+pool.dynamicData.volume24h)
    dailyRevenue.addUSDValue(+(pool.dynamicData.fees24h*0.5)) // 50% of fees go to the protocol
    dailyRevenue.addUSDValue(+(pool.dynamicData.yieldCapture24h *0.1)) // 10% of yield capture goes to the protocol
  })
  return { dailyFees, dailyVolume, dailyRevenue }
}


export default adapter;
