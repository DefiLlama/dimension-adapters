import { CHAIN } from '../helpers/chains'
import { uniV2Exports } from '../helpers/uniswap'
import { addTokensReceived } from '../helpers/token'

export default uniV2Exports({
  [CHAIN.POLYGON]: { factory: '0x2d7360Db7216792cfc2c73B79C0cA629007E2af4', start: '2025-04-23', customLogic, },
})

async function customLogic({ dailyVolume, filteredPairs, fetchOptions }: any) {
  const filteredPairIds = Object.keys(filteredPairs)
  const feeContracts = await fetchOptions.api.multiCall({ abi: 'address:fees', calls: filteredPairIds })

  const dailyHoldersRevenue = await addTokensReceived({ options: fetchOptions, targets: feeContracts, skipIndexer: true })
  const dailyRevenue = dailyHoldersRevenue.clone(1 / 0.85) // 15% of the fees are sent to the protocol
  const dailyProtocolRevenue = dailyRevenue.clone(0.15)

  return { dailyVolume, dailyProtocolRevenue, dailyHoldersRevenue, dailyRevenue, dailyFees: dailyRevenue }
}