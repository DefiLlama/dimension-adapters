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
  adapter.adapter[chain] = { fetch, runAtCurrTime: true, }
})

// chains = ["MAINNET", "ARBITRUM", "AVALANCHE", "BASE", "GNOSIS", "POLYGON", "ZKEVM", "OPTIMISM", "MODE", "FRAXTAL"]

async function fetch({ createBalances, chain}: FetchOptions) {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const query = `query {
  pools: poolGetPools(
    first: 1000
    skip: 0
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
    }
  }
}` 
  const { pools } = await request('https://api-v3.balancer.fi/graphql', query);
  pools.forEach((pool: any) => {
    dailyFees.addUSDValue(+pool.dynamicData.fees24h)
    dailyVolume.addUSDValue(+pool.dynamicData.volume24h)
  })
  return { dailyFees, dailyVolume }
}


export default adapter;
