import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

const config: any = {
  [CHAIN.ARBITRUM]: {
    exchanges: [
      '0xF7CA7384cc6619866749955065f17beDD3ED80bC', // ETH/USDC
      '0x85DDE4A11cF366Fb56e05cafE2579E7119D5bC2f', // WBTC/ETH
    ],
    USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  },
  [CHAIN.AVAX]: {
    exchanges: [
      '0xE9c2D66A1e23Db21D2c40552EC7fA3dFb91d0123', // JOE/USDC
      '0xb2698B90BE455D617c0C5c1Bbc8Bc21Aa33F2Bbb', // WAVAX/USDC
    ],
    USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  },
}

const abis = {
  positionChanged:
    'event PositionChanged(address indexed trader, uint256 tradeFee, uint256 traderPayout, int256 previousAsset, int256 previousStable, int256 newAsset, int256 newStable)',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const chainConfig = config[options.chain]

  if (!chainConfig) {
    throw new Error(`No chain config found for chain: ${options.chain}`)
  }

  const logs = await options.getLogs({
    targets: chainConfig.exchanges,
    eventAbi: abis.positionChanged,
    flatten: true,
  })

  logs.forEach((log: any) => {
    const tradeFee = log.tradeFee

    if (!tradeFee) {
      return
    }

    dailyFees.add(chainConfig.USDC, tradeFee)
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees:
    'Trading fees as reported by the tradeFee field in PositionChanged events. Futureswap is a leveraged derivatives protocol and does not emit explicit fee settlement events.',
  Revenue:
    'All reported trade fees are treated as protocol revenue due to lack of on-chain fee distribution data.',
  ProtocolRevenue:
    'Same as Revenue.',
  Limitations:
    'PositionChanged events reflect leveraged position accounting and may overestimate realized fees. Volume and LP revenue are intentionally not reported.',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2021-10-13' },
    [CHAIN.AVAX]: { start: '2022-04-22' },
  },
  methodology,
}

export default adapter
