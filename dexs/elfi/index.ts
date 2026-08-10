import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { ethers } from 'ethers'

const contracts: Record<string, string> = {
  [CHAIN.ARBITRUM]: '0x153c613D572c050104086c7113d00B76Fbaa5d55',
  [CHAIN.BASE]: '0x957e0C2Ea128b0307B5730ff83e0bA508b729d50',
}

// OrderFilled event topic
const ORDER_FILLED_TOPIC = '0x27cd10c59ec617eb0cc015b5900117fef098349140a09083205d2a32afe025bb'

// ABI types for decoding the data portion (non-indexed params)
const ORDER_INFO_TYPES = [
  'tuple(address account, bytes32 symbol, uint8 orderSide, uint8 posSide, uint8 orderType, uint8 stopType, bool isCrossMargin, bool isExecutionFeeFromTradeVault, address marginToken, uint256 qty, uint256 leverage, uint256 orderMargin, uint256 triggerPrice, uint256 acceptablePrice, uint256 placeTime, uint256 executionFee, uint256 lastBlock)',
  'uint256', // fillQty
  'uint256', // fillTime
  'uint256', // fillPrice
]

const fetch = async ({ getLogs, chain, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances()

  const logs = await getLogs({
    target: contracts[chain],
    topics: [ORDER_FILLED_TOPIC],
    entireLog: true,
  })

  const abiCoder = ethers.AbiCoder.defaultAbiCoder()

  logs.forEach((log: any) => {
    const decoded = abiCoder.decode(ORDER_INFO_TYPES, log.data)
    const orderInfo = decoded[0]
    const fillQty = decoded[1]

    const qty = orderInfo.qty
    const volume = fillQty > 0n ? fillQty : qty
    if (volume === 0n) return

    // Convert from 1e18 to USD with bigint-safe scaling (keep 6 decimals)
    const volumeUsd = Number(volume / 10n ** 12n) / 1e6
    dailyVolume.addCGToken('tether', volumeUsd)
  })

  return {
    dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-07-18',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-10-01',
    },
  },
  methodology: {
    Volume:
      'Sum of all filled order notional values (position size including leverage) from on-chain events.',
  },
}

export default adapter
