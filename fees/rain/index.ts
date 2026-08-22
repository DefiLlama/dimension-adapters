import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import fetchURL from "../../utils/fetchURL";

const rainHistoricalFeesUrl = 'https://api-v3.rain.fi/api/dirty/historical-apys?days=30';

const fetch = async (options: FetchOptions) => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
  if (options.fromTimestamp * 1000 < thirtyDaysAgo) {
    throw new Error('Only last 30 days history is available')
  }
  const dailyRevenue = await getSolanaReceived({ options, target: 'H3RFN3GbDfwGhZc5QPqzW6U4cwhuk9vgPhEfFbcPDrm5' })
  const stats: any = (await fetchURL(rainHistoricalFeesUrl));

  let dailyFees = dailyRevenue.clone()
  for (const market of stats.result) {
    for (const dateData of market.data) {
      if (dateData.date === options.dateString) {
        dailyFees.addUSDValue(Number(dateData.interest))
      }
    }
  }

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }
}


const adapter: SimpleAdapter = {
  version: 1, // api updates once a day
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-01-01',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Interest paid by borrowers.',
    Revenue: 'Amount of intertest collected by Rain protocol.',
    SupplySideRevenue: 'Amount of intertest distributed to lenders.',
    ProtocolRevenue: 'Amount of intertest collected by Rain protocol.',
  }
}

export default adapter;
