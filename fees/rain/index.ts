import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import fetchURL from "../../utils/fetchURL";

const rainHistoricalFeesUrl = 'https://api-v3.rain.fi/api/dirty/historical-apys?days=30';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyRevenue = await getSolanaReceived({ options, target: 'H3RFN3GbDfwGhZc5QPqzW6U4cwhuk9vgPhEfFbcPDrm5' })
  const stats: any = (await fetchURL(rainHistoricalFeesUrl));

  const dateString = new Date(options.startOfDay * 1000).toISOString().split('T')[0]

  let dailyFees = dailyRevenue.clone()
  for (const market of stats.result) {
    for (const dateData of market.data) {
      if (dateData.date === dateString) {
        dailyFees.addUSDValue(Number(dateData.interest))
      }
    }
  }

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }
}


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-01-01',
  // runAtCurrTime: true,
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
