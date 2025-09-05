import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from '../helpers/metrics';
import { httpGet } from '../utils/fetchURL';

let buybackData: any
async function fetchFromApi({ dateString, createBalances, }: FetchOptions) {
  if (!buybackData)
    buybackData = httpGet('https://fees.pump.fun/api/buybacks').then(({ dailyBuybacks }) => {
      const dateMap: any = {}
      Object.entries(dailyBuybacks).forEach(([date, i]: any) => {
        date = date.split('T')[0]
        dateMap[date] = i
      })
      return dateMap
    })

  buybackData = await buybackData
  if (!buybackData[dateString]) throw new Error('No buyback data for date: ' + dateString)
  const { pumpFeesUsd, buybackUsd } = buybackData[dateString]
  const dailyFees = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  dailyFees.addUSDValue(pumpFeesUsd, 'LaunchpadFee')
  dailyHoldersRevenue.addUSDValue(buybackUsd, METRIC.TOKEN_BUY_BACK)
  dailyProtocolRevenue.addUSDValue(pumpFeesUsd - buybackUsd)

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(1, 'LaunchpadFee'),
    dailyProtocolRevenue,
    dailyHoldersRevenue
  }
}

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {

  if (options.startTimestamp >= 1721779200) { // 2025-07-14 00:00:00 UTC,  there is no buyback before that
    try {
      const response = await fetchFromApi(options);
      return response
    } catch (e) {
      console.log('Error fetching from API, falling back to Dune', e);
    }
  }

  const dailyFees = options.createBalances();


  // https://dune.com/queries/4313339
  const value = (await queryDuneSql(options,
    `WITH excluded_transactions AS (
      SELECT DISTINCT tx_id
      FROM solana.account_activity
      WHERE tx_success = TRUE
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <= from_unixtime(${options.endTimestamp})
        AND address IN (
          '49AdQfhKyVgWKb1HPi6maQxm5tqJasePR9K6Mn67hEYA',
          'EkuimaBYybHvviYjtMXcnC7eg6WQmzLriDPtvh98fjRg',
          'CL9jPThhYnxvPSWNLhR4J7in13WvtMXXBGCe8LEhipmj',
          '94qWNrtmfn42h3ZjUZwWvK1MEo9uVmmrBPd2hpNjYDjb',
          '7xQYoUjUJF1Kg6WVczoTAkaNhn5syQYcbvjmFrhjWpx',
          'BWXT6RUhit9FfJQM3pBmqeFLPYmuxgmyhMGC5sGr8RbA',
          'Bvtgim23rfocUzxVX9j9QFxTbBnH8JZxnaGLCEkXvjKS',
          'FGptqdxjahafaCzpZ1T6EDtCzYMv7Dyn5MgBLyB3VUFW',
          'X5QPJcpph4mBAJDzc4hRziFftSbcygV59kRb2Fu6Je1',
          '7GFUN3bWzJMKMRZ34JLsvcqdssDbXnp589SiE33KVwcC'
        )
        AND balance_change < 0
    ),

    daily_revenue AS (
      SELECT 
        SUM(sa.balance_change) / 1e9 AS daily_revenue_sol 
      FROM solana.account_activity sa
      LEFT JOIN excluded_transactions et ON sa.tx_id = et.tx_id
      WHERE sa.tx_success = TRUE
        AND sa.block_time >= from_unixtime(${options.startTimestamp})
        AND sa.block_time <= from_unixtime(${options.endTimestamp})
        AND (sa.address = 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM'
            or sa.address = '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV'
            or sa.address = 'FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz'
            or sa.address = '7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX'
            or sa.address = 'AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY'
            or sa.address = '9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz'
            or sa.address = 'G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP'
            or sa.address = '7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ')
        AND sa.balance_change > 0
        AND et.tx_id IS NULL 
    )
    SELECT
      SUM(daily_revenue_sol) as total_sol_revenue
    FROM daily_revenue
    `
  ));
  dailyFees.add(ADDRESSES.solana.SOL, value[0].total_sol_revenue * 1e9, 'LaunchpadFee');
  const response = {
    dailyFees,
    dailyRevenue: dailyFees.clone(1, 'LaunchpadFee'),
    dailyProtocolRevenue: dailyFees.clone(1, 'LaunchpadFee'),
  }

  if (options.startTimestamp <= 1721779200) { // 2025-07-14 00:00:00 UTC,  there is no buyback before that
    return response
  }

  const query = `
    SELECT 
      SUM(amount_display) as total_amount
    FROM tokens_solana.transfers t
    WHERE 
      block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
      AND from_owner IN (
        '3vkpy5YHqnqJTnA5doWTpcgKyZiYsaXYzYM9wm8s3WTi',
        '88uq8JNL6ANwmow1og7VQD4hte73Jpw8qsUP77BtF6iE',
        '3YNxfRAEqKrGNCmx5JUfCD9er5djZToqSomzR2Yi8rqx'
      )
      AND to_owner NOT IN (
        '6UJoY1CFEymoqMrnmBLeZoemBGiJcySNdR7Jyj2nF848',
        '88uq8JNL6ANwmow1og7VQD4hte73Jpw8qsUP77BtF6iE',
        '3YNxfRAEqKrGNCmx5JUfCD9er5djZToqSomzR2Yi8rqx'
      )
      AND (token_mint_address = 'So11111111111111111111111111111111111111112' OR token_mint_address = 'So11111111111111111111111111111111111111111')
  `
  const res = await queryDuneSql(options, query);
  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.add(ADDRESSES.solana.SOL, (res[0].total_amount || 0) * 1e9, METRIC.TOKEN_BUY_BACK)

  const dailyProtocolRevenue = dailyFees.clone()
  dailyProtocolRevenue.subtract(dailyHoldersRevenue)

  return { ...response, dailyHoldersRevenue, dailyProtocolRevenue };
}

const breakdownMethodology = {
  Fees: {
    'LaunchpadFee': 'Trade fees from launchpad',
  },
  Revenue: {
    'LaunchpadFee': 'Trade fees from launchpad that goes to the protocol',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Pump token buyback"
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SOLANA],
  fetch,
  isExpensiveAdapter: true,
  allowNegativeValue: true,
  start: '2024-01-14',
  breakdownMethodology,
  methodology: {
    Fees: "Trading and launching tokens fees paid by users",
    Revenue: "Trading and launching tokens fees paid by users",
    ProtocolRevenue: "pump.fun takes all fees paid by users",
    HoldersRevenue: "PUMP token buybacks from the revenue"
  }
};

export default adapter;
