import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { httpGet } from "../utils/fetchURL"

const METAPLEX_API_KEY = process.env.METAPLEX_API_KEY
const url = `https://analytics.topledger.xyz/metaplex/api/queries/10849/results.json?api_key=${METAPLEX_API_KEY}`

interface IFees {
  block_date: string;
  revenue_in_usd: number;
}

const fetchFees = async (timestamp: number, _t: any, options: FetchOptions) => {
  const res: IFees[] = (await httpGet(url)).query_result.data.rows;
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  const dailyItem = res.find(item => item.block_date === dateStr)
  if (!dailyItem) {
    throw new Error(`No daily item found for ${dateStr}`)
  }
  const dailyFees = dailyItem.revenue_in_usd
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
  }
}

export default adapter
