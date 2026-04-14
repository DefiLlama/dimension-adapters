import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDuneSql } from "../helpers/dune"
import { getEnv } from "../helpers/env"
import { httpGet } from "../utils/fetchURL"

const url = `https://analytics.topledger.xyz/metaplex-api/api/queries/12250/results.json?api_key=${getEnv('METAPLEX_API_KEY')}`

interface IFees {
  block_date: string;
  revenue_in_usd: number;
}

const fetchFees = async (_a: any, _t: any, options: FetchOptions) => {
  const res: IFees[] = (await httpGet(url)).query_result.data.rows;
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  const dailyItem = res.find(item => item.block_date === dateStr)
  
  let dailyFees = options.createBalances()

  if (dailyItem) {
    dailyFees.addUSDValue(dailyItem.revenue_in_usd);
  } else {
    // using Dune
    const duneQuery = `
      SELECT 
        SUM(balance_change) AS fees_daily_sol
      FROM solana.account_activity
      WHERE address = '9kwU8PYhsmRfgS3nwnzT3TvnDeuvdbMAXqWsri2X8rAU'
        AND balance_change > 0
        AND token_mint_address IS NULL
        AND TIME_RANGE
    `
    
    const queryResults = await queryDuneSql(options, duneQuery);
    dailyFees.add('So11111111111111111111111111111111111111112', queryResults[0].fees_daily_sol)
  }
  
  const protocolRevenueRatio = options.startOfDay > 1685577600 ? 0.5 : 1
  const dailyProtocolRevenue = dailyFees.clone(protocolRevenueRatio)
  const dailyHoldersRevenue = dailyFees.clone(1 - protocolRevenueRatio)

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
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'All fees paid by users for launching, trading assets.',
    UserFees: 'All fees paid by users for launching, trading assets.',
    Revenue: 'Fees collected by Metaplex protocol.',
    ProtocolRevenue: '50% of revenue goes to protocol after june 2023',
    HoldersRevenue: '50% of revenue goes to buyback MPLX after june 2023', // https://x.com/metaplex/status/1930306067407483219
  }
}

export default adapter
