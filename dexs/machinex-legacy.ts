import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getConfig } from "../helpers/cache";
import { addOneToken } from "../helpers/prices";
import { METRIC } from "../helpers/metrics";

const poolsEndpoint = 'https://machinex-api-production.up.railway.app/data'
const swapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

async function fetch(options: FetchOptions) {
  const { pairs } = await getConfig('machinex-legacy-peaq', poolsEndpoint)
  const pools = pairs.filter((pair: any) => pair.hasOwnProperty('stable'))

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const logs = await options.getLogs({
    targets: pools.map((pool: any) => pool.id),
    eventAbi: swapEvent,
    flatten: false,
  })

  logs.forEach((poolLogs: any[], index: number) => {
    const { token0, token1, fee } = pools[index]
    const feeRatio = Number(fee) / 1e6
    poolLogs.forEach((log: any) => {
      addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
      addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * feeRatio, amount1: Number(log.amount1In) * feeRatio, label: METRIC.SWAP_FEES })
      addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * feeRatio, amount1: Number(log.amount1Out) * feeRatio, label: METRIC.SWAP_FEES })
    })
  })

  return { dailyVolume, dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.PEAQ],
  methodology: {
    Volume: "Swap events on the MachineX legacy pools, read on chain.",
    Fees: "Fees from swap events on the MachineX legacy pools, taken at each pool's own fee rate.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Fees from swap events on the MachineX legacy pools, taken at each pool's own fee rate.",
    },
  },
  skipBreakdownValidation: true,
}

export default adapter
