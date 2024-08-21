import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { httpGet } from "../utils/fetchURL"

const METAPLEX_API_KEY = process.env.METAPLEX_API_KEY
const url = `https://analytics.topledger.xyz/metaplex/api/queries/10849/results.json?api_key=${METAPLEX_API_KEY}`

interface IFees {
  block_date: string;
  revenue_in_usd: number;
  cumulative_revenue_in_usd: number;
}
const fetchFees = async (timestamp: number, _t: any, options: FetchOptions) => {
  const res:  IFees[] = (await httpGet(url)).query_result.data.rows;
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  const dailyItem = res.find(item => item.block_date === dateStr)
  return {
    dailyFees: dailyItem?.revenue_in_usd || 0,
    totalFees: dailyItem?.cumulative_revenue_in_usd || 0,
    dailyRevenue: dailyItem?.revenue_in_usd || 0,
    totalRevenue: dailyItem?.cumulative_revenue_in_usd || 0,
    timestamp,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: 1631952000,
    }
  }
}
export default adapter
