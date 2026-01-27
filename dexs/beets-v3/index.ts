import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const v3ChainMapping: any = {
  [CHAIN.SONIC]: 'SONIC',
}


const adapter: SimpleAdapter = {
  version: 2,
  runAtCurrTime: true,
  methodology: {
    Volume: 'Total volume is the sum of all trades in the last 24 hours.',
    Fees: 'Total fees earned from all the trades and yield in the last 24 hours.',
    Revenue: 'Total revenue earned by the protocol in the last 24 hours, which is 25% of the fees and yield capture.',
  },
  fetch,
  chains: Object.keys(v3ChainMapping),
};

async function fetch({ createBalances, chain }: FetchOptions) {
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
    dailyRevenue.addUSDValue(+(pool.dynamicData.fees24h * 0.25)) // 25% of fees go to the protocol
    dailyRevenue.addUSDValue(+(pool.dynamicData.yieldCapture24h * 0.25)) // 25% of yield capture goes to the protocol
  })
  return { dailyFees, dailyVolume, dailyRevenue }
}


export default adapter;
