import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import fetchURL from "../../utils/fetchURL";

interface Statistics {
  all: PeriodStats;
  pastYear: PeriodStats;
  pastMonth: PeriodStats;
  pastWeek: PeriodStats;
  pastDay: PeriodStats;
}

interface PeriodStats {
  totalInterest: number;
  totalProfit: number;
  totalLoss: number;
}

const rainFeesUrl = "https://api-v3.rain.fi/api/dirty/all-lender-profit"

const fethcFeesSolana = async (options: FetchOptions) => {
  const dailyRevenue = await getSolanaReceived({ options, target: 'H3RFN3GbDfwGhZc5QPqzW6U4cwhuk9vgPhEfFbcPDrm5' })
  const stats: Statistics = (await fetchURL(rainFeesUrl));

  const dailyFees = stats.pastDay.totalInterest + stats.pastDay.totalProfit + stats.pastDay.totalLoss
  const totalFees = stats.all.totalInterest + stats.all.totalProfit + stats.all.totalLoss

  return { dailyFees, totalFees, dailyRevenue }
}


const adapter: SimpleAdapter = {
  version: 2,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2025-01-01',
    },
  }
}

export default adapter;
