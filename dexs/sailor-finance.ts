import { FetchOptions } from '../adapters/types';
import { getConfig } from '../helpers/cache';
import { CHAIN } from '../helpers/chains';
import { addOneToken } from '../helpers/prices';
import { filterPools2 } from '../helpers/uniswap';

const endpoint = "https://asia-southeast1-ktx-finance-2.cloudfunctions.net/sailor_poolapi/getPoolList";

const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

const fetch = async (options: FetchOptions) => {
  const { poolStats } = await getConfig('sailor-v3/sei', endpoint)
  const filterObject: any = {
    fetchOptions: options,
    pairs: [],
    token0s: [],
    token1s: [],
  }

  poolStats.forEach((pool: any) => {
    filterObject.pairs.push(pool.id)
    filterObject.token0s.push(pool.token0.id)
    filterObject.token1s.push(pool.token1.id)
  })

  const { pairs } = await filterPools2(filterObject)
  const filteredPoolStats = poolStats.filter((pool: any) => pairs.includes(pool.id))

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const logs = await options.getLogs({
    eventAbi: poolSwapEvent,
    targets: filteredPoolStats.map((item: any) => item.id),
    flatten: false,
  })

  for (let i = 0; i < filteredPoolStats.length; i++) {
    const feeRate = Number(filteredPoolStats[i].feeTier) / 1e6
    for (const log of logs[i]) {
      addOneToken({ chain: options.chain, balances: dailyVolume, token0: filteredPoolStats[i].token0.id, token1: filteredPoolStats[i].token1.id, amount0: Math.abs(Number(log.amount0)), amount1: Math.abs(Number(log.amount1)) })
      addOneToken({ chain: options.chain, balances: dailyFees, token0: filteredPoolStats[i].token0.id, token1: filteredPoolStats[i].token1.id, amount0: Math.abs(Number(log.amount0)) * feeRate, amount1: Math.abs(Number(log.amount1)) * feeRate })
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees.clone(0.16),
    dailyHoldersRevenue: 0,
    dailyProtocolRevenue: dailyFees.clone(0.16),
    dailySupplySideRevenue: dailyFees.clone(0.84),
  }
};

const methodology = {
  Fees: "Sailor-Finance protocol swap fee (0.3% per swap).",
  UserFees: "Sailor-Finance protocol swap fee (0.3% per swap).",
  Revenue: "Fees distributed to the LP providers (84% of total accumulated fees).",
  ProtocolRevenue: "Fees sent to the protocol wallet (16% of total accumulated fees), is used to provide benefits to users in custom ways.",
  SupplySideRevenue: "There are 84% swap fees distributed to LPs.",
};


export default {
  version: 2,
  fetch,
  methodology,
  chains: [CHAIN.SEI],
}
