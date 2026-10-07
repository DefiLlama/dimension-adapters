import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Lifetime Fees - daily fees broken down by product, of which SPOT_FEES is the spot share
// source: https://www.paradex.trade/stats
// Row format: [TRADE_DATE, PERP_FEES, PERP_OPTION_FEES, SPOT_FEES, OPTION_FEES, TOTAL_FEE, CUMULATIVE_FEES]
const dailyFeesEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/20068/card/21188?parameters=%5B%5D'
const SPOT_FEES_INDEX = 3

const fetch = async (options: FetchOptions) => {
  const response = await fetchURL(dailyFeesEndpoint)
  const fees = response.data.rows.find((row: string[]) => row[0].slice(0, 10) === options.dateString)?.[SPOT_FEES_INDEX]
  if (fees == null) throw new Error(`Missing Paradex spot fees for ${options.dateString}`)

  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  dailyFees.addUSDValue(fees, 'Spot Trading Fees')
  dailyUserFees.addUSDValue(fees, 'Spot Trading Fees')

  return {
    dailyFees,
    dailyUserFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2026-02-05',
    },
  },
  methodology: {
    Fees: "Spot trading fees paid by takers and makers on Paradex, taken from the SPOT_FEES breakdown of the public Paradex stats dashboard.",
    UserFees: "Spot trading fees paid by users on Paradex.",
  },
  breakdownMethodology: {
    'Spot Trading Fees': "Spot trading fees paid by users on Paradex, from the SPOT_FEES breakdown of the public Paradex stats dashboard.",
  },
  // Paradex does not publish a supply-side/protocol split of its fees, so - as with
  // the Paradex perps and options adapters - dailyRevenue is deliberately not reported.
  skipBreakdownValidation: true,
}

export default adapter;
