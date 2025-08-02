import { FetchOptions, FetchResultFees, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from '../../helpers/dune'
import { Balances } from '@defillama/sdk'
import BigNumber from 'bignumber.js'

const susds: Record<string, string> = {
  ethereum: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD',
  optimism: '0xb5B2dc7fd34C249F4be7fB1fCea07950784229e0',
  unichain: '0xA06b10Db9F390990364A3984C04FaDf1c13691b5',
  base: '0x5875eEE11Cf8398102FdAd704C9E96607675467a',
  arbitrum: '0xdDb46999F8891663a8F2828d25298f70416d7610',
}
const susdc: Record<string, string> = {
  ethereum: '0xBc65ad17c5C0a2A4D159fa5a503f4992c7B545FE',
  optimism: '0xCF9326e24EBfFBEF22ce1050007A43A3c0B6DB55',
  unichain: '0x14d9143BEcC348920b68D123687045db49a016C6',
  base: '0x3128a0F7f0ea68E7B7c9B00AFa7E41045828e858',
  arbitrum: '0x940098b108fB7D0a7E374f6eDED7760787464609',
}
const savingsTokenDecimals = 18

const methodology = {
  Revenue: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
}

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

async function fetchMainnetData(options: FetchOptions): Promise<FetchResultFees> {
  const dailyRevenue = options.createBalances()

  await calculateDomainRevenue(options, dailyRevenue)

  const date = getDay(options.startOfDay)

  const susdsQueries = [
    getStakedUsdsSpkRefRevenueQuery(date),
    getStakedUsdsSkyRefRevenueQuery(date),
    getTreasuryUsdsRevenueQuery(date),
  ]
  const susdsResponses = await Promise.all(susdsQueries.map((query => {
    return queryDuneSql(options, query)
  })))

  for (const susdsResponse of susdsResponses) {
    dailyRevenue.addToken(susds[options.chain], BigNumber(susdsResponse[0]?.revenue ?? 0).times(10 ** savingsTokenDecimals))
  }

  const protocolResponse = await queryDuneSql(options, getProtocolRevenueQuery(date))
  dailyRevenue.addUSDValue(protocolResponse[0].revenue, { skipChain: true })

  return { dailyRevenue }
}

async function fetchForeignDomainData(options: FetchOptions): Promise<FetchResultFees> {
  const dailyRevenue = options.createBalances()

  await calculateDomainRevenue(options, dailyRevenue)

  return { dailyRevenue }
}

async function calculateDomainRevenue(options: FetchOptions, dailyRevenue: Balances) {
  const date = getDay(options.startOfDay)

  const susdsResponse = await queryDuneSql(options, getSusdsIntegratorRevenueQuery(date, options.chain))
  dailyRevenue.addToken(susds[options.chain], BigNumber(susdsResponse[0]?.revenue ?? 0).times(10 ** savingsTokenDecimals))

  const susdcResponse = await queryDuneSql(options, getSusdcIntegratorRevenueQuery(date, options.chain))
  dailyRevenue.addToken(susdc[options.chain], BigNumber(susdcResponse[0]?.revenue ?? 0).times(10 ** savingsTokenDecimals))
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchMainnetData,
      start: '2024-07-20',
    },
    [CHAIN.BASE]: {
      fetch: fetchForeignDomainData,
      start: '2024-11-19',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchForeignDomainData,
      start: '2025-03-04',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchForeignDomainData,
      start: '2024-07-20',
    },
    [CHAIN.UNICHAIN]: {
      fetch: fetchForeignDomainData,
      start: '2025-06-14',
    },
  },
}

function getSusdsIntegratorRevenueQuery(date: string, chain: string) {
  return `select sum(tw_reward) as revenue from query_5562275 where dt = date '${date}' and blockchain = '${chain}';`
}

function getStakedUsdsSpkRefRevenueQuery(date: string) {
  return `select sum(tw_reward) as revenue from query_5562275 where dt = date '${date}';`
}

function getStakedUsdsSkyRefRevenueQuery(date: string) {
  return `select sum(tw_reward) as revenue from query_5562292 where dt = date '${date}';`
}

function getTreasuryUsdsRevenueQuery(date: string) {
  return `select sum(tw_reward) as revenue from query_5562343 where dt = date '${date}';`
}

function getSusdcIntegratorRevenueQuery(date: string, chain: string) {
  return `select sum(tw_reward) as revenue from query_5562228 where dt = date '${date}' and blockchain = '${chain}';`
}

function getProtocolRevenueQuery(date: string) {
  return `select sum(tw_rebate_usd) as revenue from query_5562402 where dt = date '${date}';`
}

export default adapter
