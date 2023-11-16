import axios from "axios"
import { FetchResultFees, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

interface IRevenue {
  DAY: string;
  NETWORK_FEE: number;
  SLASHING_INCOME: number;
  LIQUIDITY_FEES: number;
  OUTBOUND_FEE: number;
  GAS_REIMBURSEMENT: number;
  IL_PROTECTION: number;
  BLOCK_REWARDS: number;
  REVENUE: number;
  EXPENSES: number;
}

interface IFees {
  DAY: string;
  LIQUIDITY_FEES: number;
  LIQUIDITY_FEES_USD: number;
  BLOCK_REWARDS: number;
  BLOCK_REWARDS_USD: number;
  PCT_OF_EARNINGS_FROM_LIQ_FEES: number;
  PCT_30D_MOVING_AVERAGE: number;
  TOTAL_EARNINGS: number;
  TOTAL_EARNINGS_USD: number;
  EARNINGS_TO_NODES: number;
  EARNINGS_TO_NODES_USD: number;
  EARNINGS_TO_POOLS: number;
  EARNINGS_TO_POOLS_USD: number;
  LIQUIDITY_FEES_USD_CUMULATIVE: number;
  BLOCK_REWARDS_USD_CUMULATIVE: number;
  TOTAL_EARNINGS_USD_CUMULATIVE: number;
  EARNINGS_TO_NODES_USD_CUMULATIVE: number;
  EARNINGS_TO_POOLS_USD_CUMULATIVE: number;
}

interface IEarning {
  avgNodeCount: string;
  blockRewards: string;
  bondingEarnings: string;
  earnings: string;
  endTime: string;
  liquidityEarnings: string;
  liquidityFees: string;
  pools: string;
  runePriceUSD: string;
  startTime: string;
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const url1 = "https://api.flipsidecrypto.com/api/v2/queries/1d13d4a1-d073-4a73-a46b-d7aadf060672/data/latest"
  const url2 = "https://api.flipsidecrypto.com/api/v2/queries/46dc4fa4-a362-420e-97ec-d3a58d46b9e7/data/latest"
  const url3 = "https://midgard.ninerealms.com/v2/history/earnings"
  const [reveune, fees, earnings]: any = (await Promise.all([
    axios.get(url1),
    axios.get(url2),
    // axios.get(url3, { headers: {"x-client-id": "defillama"}})
  ])).map(res => res.data)
  // const fs = require('fs');
  // fs.writeFileSync('reveune.json', JSON.stringify(reveune));
  // fs.writeFileSync('fees.json', JSON.stringify(fees));

  const reveuneData: IRevenue[] = reveune;
  const feesData: IFees[] = fees;
  // const earningData: IEarning = earnings.meta;

  const dayTimestamp = new Date(timestamp * 1000).toISOString().split("T")[0]
  const dailyRevenueData: IRevenue = reveuneData.find(item => item.DAY === dayTimestamp) as IRevenue
  const dailyFeesData: IFees = feesData.find(item => item.DAY === dayTimestamp) as IFees
  const dailyFees = dailyRevenueData.REVENUE;
  const dailyUsersFees = dailyFeesData?.LIQUIDITY_FEES || 0 + dailyRevenueData?.OUTBOUND_FEE || 0;
  const dailyRevenue = dailyRevenueData.REVENUE;
  const dailyProtocolRev = dailyRevenueData.REVENUE;


  return {
    dailyFees: dailyFees ? `${dailyFees}` : undefined,
    dailyUserFees: dailyUsersFees ? `${dailyUsersFees}` : undefined,
    dailyRevenue: dailyRevenue ? `${dailyRevenue}` : undefined,
    dailyProtocolRevenue: dailyProtocolRev ? `${dailyProtocolRev}` : undefined,
    timestamp
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.THORCHAIN]: {
      fetch: fetchFees,
      start: async () => 1618099200,
    }
  }
}

export default adapters
