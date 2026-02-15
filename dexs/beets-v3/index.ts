import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const v3ChainMapping: any = {
  [CHAIN.SONIC]: 'SONIC',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Fees collected from token swaps in liquidity pools',
    'Yield capture': 'Revenue generated from yield-bearing tokens held in pools (e.g., stETH, wstETH)',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Protocol share of swap fees (25% of total swap fees)',
    'Protocol yield capture': 'Protocol share of yield capture (25% of total yield capture)',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'Liquidity provider share of swap fees and yield capture (75% of total)',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  runAtCurrTime: true,
  methodology: {
    Volume: 'Total volume is the sum of all trades in the last 24 hours.',
    Fees: 'Total fees earned from all the trades and yield in the last 24 hours.',
    Revenue: 'Total revenue earned by the protocol in the last 24 hours, which is 25% of the fees and yield capture.',
  },
  breakdownMethodology,
  fetch,
  chains: Object.keys(v3ChainMapping),
};

async function fetch({ createBalances, chain }: FetchOptions) {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
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
    dailyFees.addUSDValue(+pool.dynamicData.fees24h, METRIC.SWAP_FEES)
    dailyFees.addUSDValue(+pool.dynamicData.yieldCapture24h, 'Yield capture')
    dailyVolume.addUSDValue(+pool.dynamicData.volume24h)
    dailyRevenue.addUSDValue(+(pool.dynamicData.fees24h * 0.25), METRIC.PROTOCOL_FEES) // 25% of fees go to the protocol
    dailyRevenue.addUSDValue(+(pool.dynamicData.yieldCapture24h * 0.25), 'Protocol yield capture') // 25% of yield capture goes to the protocol
    dailySupplySideRevenue.addUSDValue(+(pool.dynamicData.fees24h * 0.75), METRIC.LP_FEES) // 75% of fees go to LPs
    dailySupplySideRevenue.addUSDValue(+(pool.dynamicData.yieldCapture24h * 0.75), METRIC.LP_FEES) // 75% of yield capture goes to LPs
  })
  return { dailyFees, dailyVolume, dailyRevenue, dailySupplySideRevenue }
}


export default adapter;
