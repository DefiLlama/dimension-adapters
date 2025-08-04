import { FetchOptions, FetchResultFees, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from '../../helpers/dune'
import { Balances } from '@defillama/sdk'
import BigNumber from 'bignumber.js'

const methodology = {
  Revenue: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
}

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

async function fetch(options: FetchOptions): Promise<FetchResultFees> {
  const dailyRevenue = options.createBalances()

  const date = getDay(options.startOfDay)

  const protocolResponse = await queryDuneSql(options, getRevenueQuery(date))
  dailyRevenue.addUSDValue(protocolResponse[0].revenue, { skipChain: true })

  return { dailyRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  start: '2025-07-01',
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
    }
  },
}

function getRevenueQuery(date: string) {
  return `
      with
          -- used to retrieve the USD value based on the token symbol from Spark rewards queries
          tokens (blockchain, token_address, token_symbol) as (
              values
                  ('ethereum', 0x6B175474E89094C44Da98b954EedeAC495271d0F, 'DAI'),
                  ('ethereum', 0x6B175474E89094C44Da98b954EedeAC495271d0F, 'PT-USDS/DAI'), -- for Morpho PT-USDS/DAI
                  ('ethereum', 0xdC035D45d973E3EC169d2276DDab16f1e407384F, 'SY-USDS'), -- for Pendle SY token in PT-USDS-14AUG2025 (assuming 1 SY = 1$ value)
                  ('ethereum', 0xdC035D45d973E3EC169d2276DDab16f1e407384F, 'SY-USDS-SPK'), -- for SPK farm
                  ('ethereum', 0xdC035D45d973E3EC169d2276DDab16f1e407384F, 'stakedUSDS'), -- for staked USDS in farm
                  ('ethereum', 0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD, 'sUSDS'),
                  ('ethereum', 0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD, 'sUSDC'), -- sUSDC is a wrapper for sUSDS
                  ('ethereum', 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, 'USDC'),
                  ('ethereum', 0x4c9EDD5852cd905f086C759E8383e09bff1E68B3, 'USDe'),
                  ('ethereum', 0xdC035D45d973E3EC169d2276DDab16f1e407384F, 'USDS'),
                  ('ethereum', 0xdAC17F958D2ee523a2206206994597C13D831ec7, 'USDT')
          ),
          protocols_data as (
              select
                  dt,
                  p.blockchain,
                  protocol_name,
                  token_symbol,
                  p.reward_code,
                  p.reward_per,
                  p.interest_code,
                  p.interest_per,
                  p.amount
              from (
                       select * from dune.sparkdotfi.result_spark_rewards_protocol_level_tracking_1
                       union all
                       select * from dune.sparkdotfi.result_spark_rewards_protocol_level_tracking_2
                   ) p
              where amount is not null
                and dt >= date '2025-07-01'
          ),
          protocols_daily as (
              select
                  date_trunc('day', dt) as dt,
                  token_symbol,
                  concat(protocol_name, ' - ', token_symbol) as "protocol-token",
                  p.reward_code,
                  p.reward_per,
                  p.interest_code,
                  avg(p.interest_per) as interest_per_aprox, -- for APYs that change every day, it's an approximation
                  sum(p.amount) / 365 as tw_amount,
                  sum((p.amount / 365) * p.reward_per) as tw_rebate
              from protocols_data p
                       left join query_5379492 sl using (dt, protocol_name, token_symbol) -- Spark - Idle DAI & USDS in Sparklend by ALM Proxy
                       left join query_5411038 m using (dt, protocol_name, token_symbol)  -- Spark - Idle DAI & USDC in Morpho by ALM Proxy
                       left join query_5548062 e using (dt, protocol_name, token_symbol) -- Spark - Ethena Payout + APY
              group by 1,2,3,4,5,6
          ),
          protocols_daily_usd as (
              select
                  b.*,
                  p.price_usd,
                  b.tw_rebate * p.price_usd as tw_rebate_usd
              from protocols_daily b
                       join tokens t
                            on b.token_symbol = t.token_symbol
                       left join dune.steakhouse.result_token_price p
                                 on t.blockchain = p.blockchain
                                     and t.token_address = p.token_address
                                     and b.dt = p.dt
          )

      select sum(tw_rebate_usd) as revenue from protocols_daily_usd where dt = date '${date}'
  `
}

export default adapter
