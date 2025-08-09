import { FetchOptions } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addOneToken } from '../helpers/prices';
import { httpGet } from '../utils/fetchURL';

const endpoint = "https://asia-southeast1-ktx-finance-2.cloudfunctions.net/sailor_poolapi/getPoolList";

const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

const fetch = async (options: FetchOptions) => {
  const { poolStats } = await httpGet(endpoint)

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const logs = await options.getLogs({
    eventAbi: poolSwapEvent,
    targets: poolStats.map((item: any) => item.id),
    flatten: false,
  })

  for (let i = 0; i < poolStats.length; i++) {
    const feeRate = Number(poolStats[i].feeTier) / 1e6
    for (const log of logs[i]) {
      addOneToken({ chain: options.chain, balances: dailyVolume, token0: poolStats[i].token0.id, token1: poolStats[i].token1.id, amount0: Math.abs(Number(log.amount0)), amount1: Math.abs(Number(log.amount1)) })
      addOneToken({ chain: options.chain, balances: dailyFees, token0: poolStats[i].token0.id, token1: poolStats[i].token1.id, amount0: Math.abs(Number(log.amount0)) * feeRate, amount1: Math.abs(Number(log.amount1)) * feeRate })
      addOneToken({ chain: options.chain, balances: dailyRevenue, token0: poolStats[i].token0.id, token1: poolStats[i].token1.id, amount0: Math.abs(Number(log.amount0)) * feeRate * 0.16, amount1: Math.abs(Number(log.amount1)) * feeRate * 0.16 })
      addOneToken({ chain: options.chain, balances: dailySupplySideRevenue, token0: poolStats[i].token0.id, token1: poolStats[i].token1.id, amount0: Math.abs(Number(log.amount0)) * feeRate * 0.84, amount1: Math.abs(Number(log.amount1)) * feeRate * 0.84 })
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: dailyRevenue,
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
