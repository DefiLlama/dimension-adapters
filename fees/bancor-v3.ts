import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"

async function fetch(fetchOptions: FetchOptions) {
  const { getLogs, createBalances, } = fetchOptions
  const contract = '0xeEF417e1D5CC832e619ae18D2F140De2999dD4fB'
  const dailyFees = createBalances()
  const logs = await getLogs({ targets: [contract], eventAbi: 'event TokensTraded(bytes32 indexed contextId, address indexed sourceToken, address indexed targetToken, uint256 sourceAmount, uint256 targetAmount, uint256 bntAmount, uint256 targetFeeAmount, uint256 bntFeeAmount, address trader)' })
  logs.forEach((log: any) => dailyFees.add(log.targetToken, log.targetFeeAmount, METRIC.SWAP_FEES))
  return { dailyFees }
}

const methodology = {
  Fees: 'Swap fees charged on trades in the target token.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Fee charged on each swap, denominated in the target token of the trade.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  fetch,
  start: '2022-04-20',
  methodology,
  breakdownMethodology,
}

export default adapter;
