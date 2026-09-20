import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Lifetime Fees - daily fees broken down by product, of which OPTION_FEES is the options share
// source: https://www.paradex.trade/stats
const dailyFeesEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/20068/card/21188?parameters=%5B%5D'

const fetch = async (options: FetchOptions) => {
  const response = await fetchURL(dailyFeesEndpoint)
  const fees = response.data.rows.find((row: string[]) => row[0].slice(0, 10) === options.dateString)?.[4]
  if (fees == null) throw new Error(`Missing Paradex options fees for ${options.dateString}`)
  
  return {
    dailyFees: fees,
    dailyUserFees: fees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2026-03-25',
    },
  },
  methodology: {
    Fees: "Options trading fees paid by takers and makers on Paradex, taken from the OPTION_FEES breakdown of the public Paradex stats dashboard.",
    UserFees: "Options trading fees paid by users on Paradex.",
  },
  // Paradex does not publish a supply-side/protocol split of its fees, so - as with
  // the Paradex perps adapter - dailyRevenue is deliberately not reported.
  skipBreakdownValidation: true,
  doublecounted: true, // paradex
}

export default adapter
