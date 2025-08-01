import { CHAIN } from '../helpers/chains'
import { aaveExport, getPoolFees } from '../helpers/aave'
import { AaveMarkets } from './aave'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import ADDRESSES from '../helpers/coreAssets.json'

const methodology = {
  Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
  Revenue: 'Amount of fees go to Aave treasury.',
  SupplySideRevenue: 'Amount of fees distributed to suppliers.',
  ProtocolRevenue: 'Amount of fees go to Aave treasury.',
  HoldersRevenue: 'Aave Token Buybacks from Aave Treasury after 14th April 2025.',
}

const chainConfig = {
  [CHAIN.OPTIMISM]: {
    pools: AaveMarkets[CHAIN.OPTIMISM],
    start: '2022-08-05',
  },
  [CHAIN.ARBITRUM]: {
    pools: AaveMarkets[CHAIN.ARBITRUM],
    start: '2022-03-12',
  },
  [CHAIN.POLYGON]: {
    pools: AaveMarkets[CHAIN.POLYGON],
    start: '2022-03-12',
  },
  [CHAIN.AVAX]: {
    pools: AaveMarkets[CHAIN.AVAX],
    start: '2022-03-12',
  },
  [CHAIN.FANTOM]: {
    pools: AaveMarkets[CHAIN.FANTOM],
    start: '2022-03-12',
  },
  [CHAIN.BASE]: {
    pools: AaveMarkets[CHAIN.BASE],
    start: '2023-08-09',
  },
  [CHAIN.BSC]: {
    pools: AaveMarkets[CHAIN.BSC],
    start: '2023-11-18',
  },
  [CHAIN.METIS]: {
    pools: AaveMarkets[CHAIN.METIS],
    start: '2023-04-24',
  },
  [CHAIN.XDAI]: {
    pools: AaveMarkets[CHAIN.XDAI],
    start: '2023-10-05',
  },
  [CHAIN.SCROLL]: {
    pools: AaveMarkets[CHAIN.SCROLL],
    start: '2024-01-21',
  },
  [CHAIN.ERA]: {
    pools: AaveMarkets[CHAIN.ERA],
    start: '2024-09-09',
  },
  [CHAIN.LINEA]: {
    pools: AaveMarkets[CHAIN.LINEA],
    start: '2024-11-24',
  },
  [CHAIN.SONIC]: {
    pools: AaveMarkets[CHAIN.SONIC],
    start: '2025-02-16',
  },
  [CHAIN.CELO]: {
    pools: AaveMarkets[CHAIN.CELO],
    start: '2025-02-16',
  },
  [CHAIN.SONEIUM]: {
    pools: AaveMarkets[CHAIN.SONEIUM],
    start: '2025-05-14',
  },
}

const fetch = async (options: FetchOptions) => {
  let dailyFees = options.createBalances()
  let dailyProtocolRevenue = options.createBalances()
  let dailySupplySideRevenue = options.createBalances()
  let dailyHoldersRevenue = options.createBalances()

  const pools = AaveMarkets[CHAIN.ETHEREUM]

  for (const pool of pools) {
    await getPoolFees(pool, options, {
      dailyFees,
      dailySupplySideRevenue,
      dailyProtocolRevenue,
    })
  }

  // AAVE Buybacks https://app.aave.com/governance/v3/proposal/?proposalId=286
  const buybackLogs = await options.getLogs({
    target: ADDRESSES.ethereum.AAVE,
    eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null as any, '0xD3F72B3e91c8124DFC1B4273e93594Bb00C9be6f'],
    entireLog: true,
    parseLog: true
  })

  for (const buybackLog of buybackLogs) {
    dailyHoldersRevenue.add(ADDRESSES.ethereum.AAVE, buybackLog.args.value)
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    ...aaveExport(chainConfig),
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-01-01',
    }
  }
}

export default adapter
