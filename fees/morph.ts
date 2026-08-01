import { FetchOptions, ProtocolType, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { L2FeesFetcher } from '../helpers/ethereum-l2'

const ethereumWallets = [
  '0x6ab0e960911b50f6d14f249782ac12ec3e7584a0',
  '0xbba36cdf020788f0d08d5688c0bee3fb30ce1c80',
  '0x34e387b37d3adeaa6d5b92ce30de3af3dca39796',
  '0x76F91869161dC4348230D5F60883Dd17462035f4',
]

const feeVaults = [
  '0x530000000000000000000000000000000000000A',
]

const transferEventAbi = 'event Transfer(uint256 value, address to, address from)'

async function fetch(options: FetchOptions) {
  const { dailyFees, dailyRevenue } = await L2FeesFetcher({ feeVaults, ethereumWallets })(options);

  const transferOutLogs = await options.getLogs({
    targets: feeVaults,
    eventAbi: transferEventAbi,
  })

  transferOutLogs.forEach((log: any) => {
    dailyFees.addGasToken(log.value)
    dailyRevenue.addGasToken(log.value)
  })

  return {
    dailyFees,
    dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.MORPH],
  fetch,
  start: '2024-10-29',
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Total revenue on Morph, calculated by subtracting the L1 Batch Costs from the total gas fees',
  },
  allowNegativeValue: true, // L1 Costs
}

export default adapter
