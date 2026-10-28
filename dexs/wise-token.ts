import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { addOneToken } from "../helpers/prices";

// WISE/ETH Uniswap V2 pair. Ownerless pool - no team/admin controls it, so
// the standard 0.3% swap fee has no protocol cut: it all accrues to LPs,
// growing the pool's reserves (and thus WISE's ETH backing) directly.
const WISE_ETH_PAIR = '0x21b8065d10f73EE2e260e5B47D3344d3Ced7596E'
const SWAP_FEE = 0.003

const SwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const token0 = await options.api.call({ target: WISE_ETH_PAIR, abi: 'address:token0' })
  const token1 = await options.api.call({ target: WISE_ETH_PAIR, abi: 'address:token1' })

  const logs = await options.getLogs({ target: WISE_ETH_PAIR, eventAbi: SwapEvent })

  for (const log of logs) {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
    addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * SWAP_FEE, amount1: Number(log.amount1In) * SWAP_FEE, label: METRIC.SWAP_FEES })
    addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * SWAP_FEE, amount1: Number(log.amount1Out) * SWAP_FEE, label: METRIC.SWAP_FEES })
  }

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue: dailyFees.clone(1, METRIC.LP_FEES),
    dailyRevenue: 0,
  }
}

const methodology = {
  Volume: 'Swap volume (both sides) on the WISE/ETH Uniswap V2 pair.',
  Fees: '0.3% Uniswap V2 swap fee on the WISE/ETH pair.',
  Revenue: 'The pool is ownerless (no admin/team fee switch), so no portion of swap fees is retained as protocol revenue.',
  SupplySideRevenue: 'The pool is ownerless (no admin/team fee switch), so 100% of swap fees accrue to LPs, growing the pool reserves that back WISE.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: '0.3% Uniswap V2 swap fee on the WISE/ETH pair.',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'All swap fees accrue to LPs; the pool has LP tokens burned to divert a protocol cut.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology,
  breakdownMethodology,
  start: '2020-12-22',
  doublecounted: true, // uniswap 
}

export default adapter;
