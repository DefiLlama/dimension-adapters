import { FetchOptions, SimpleAdapter, Dependencies } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDuneSql } from "../helpers/dune"

interface IFeesData {
  day: string;
  fees_daily: number;
  revenue_usd: number;
}

const fetchFees = async (timestamp: number, _t: any, options: FetchOptions) => {
  // Try dataset query first, fallback to account activity if no results
  // Query to get daily revenue from Metaplex dataset
  const datasetQuery = `
    SELECT
      DATE_TRUNC('day', TRY_CAST(month AS TIMESTAMP)) AS day,
      SUM(protocol_revenue_in_usd) AS revenue_usd
    FROM dune.yuubee.dataset_metaplex_mints__fees
    WHERE TRY_CAST(month AS TIMESTAMP) >= from_unixtime(${options.startTimestamp})
      AND TRY_CAST(month AS TIMESTAMP) <= from_unixtime(${options.endTimestamp})
    GROUP BY 1
    ORDER BY day ASC
  `

  // Fallback query using account activity
  const accountActivityQuery = `
    SELECT 
      DATE_TRUNC('day', block_time) AS day,
      SUM(balance_change / 1e9) AS fees_daily_sol
    FROM solana.account_activity
    WHERE address = '9kwU8PYhsmRfgS3nwnzT3TvnDeuvdbMAXqWsri2X8rAU'
      AND balance_change > 0
      AND token_mint_address IS NULL
      AND TIME_RANGE
    GROUP BY 1
    ORDER BY day ASC
  `

  let results: IFeesData[] = []
  
  try {
    const queryResults = await queryDuneSql(options, datasetQuery);
    if (queryResults && queryResults.length > 0) {
      results = queryResults.map((r: any) => ({
        day: r.day,
        fees_daily: 0,
        revenue_usd: Number(r.revenue_usd) || 0
      }))
    } else {
      // If dataset returns no results, try account activity
      throw new Error('No dataset results, trying fallback')
    }
  } catch (e: any) {
    // Fallback to account activity query
    const feesResults = await queryDuneSql(options, accountActivityQuery);
    // Approximate SOL price in USD (you may want to fetch this dynamically)
    const solPrice = 150
    results = feesResults.map((r: any) => ({
      day: r.day,
      fees_daily: Number(r.fees_daily_sol) * solPrice,
      revenue_usd: 0
    }))
  }
  
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  const dailyItem = results.find(item => {
    try {
      const itemDate = new Date(item.day).toISOString().split('T')[0]
      return itemDate === dateStr
    } catch {
      return false
    }
  })
  
  if (!dailyItem) {
    const availableDates = results.slice(0, 5).map(r => {
      try {
        return new Date(r.day).toISOString().split('T')[0]
      } catch {
        return String(r.day)
      }
    }).join(', ')
    throw new Error(`No daily item found for ${dateStr}. Available dates: ${availableDates}${results.length > 5 ? '...' : ''}`)
  }
  
  // Use revenue_usd if available, otherwise use fees_daily
  const dailyFees = dailyItem.revenue_usd > 0 ? dailyItem.revenue_usd : dailyItem.fees_daily
  const dailyProtocolRevenue = (timestamp >= 1685577600) ? dailyFees * 0.5 : dailyFees
  const dailyHoldersRevenue = (timestamp >= 1685577600) ? dailyFees * 0.5 : 0

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: '2021-09-18',
    }
  },
  methodology: {
    Fees: 'All fees paid by users for launching, trading assets.',
    UserFees: 'All fees paid by users for launching, trading assets.',
    Revenue: 'Fees collected by Metaplex protocol.',
    ProtocolRevenue: '50% of revenue goes to protocol after june 2023',
    HoldersRevenue: '50% of revenue goes to buyback MPLX after june 2023', // https://x.com/metaplex/status/1930306067407483219
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE]
}

export default adapter


