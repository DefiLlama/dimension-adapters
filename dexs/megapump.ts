import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { chainConfig, collectCurveActivity } from "../fees/megapump/shared";

// MegaPump bonding-curve volume (see fees/megapump/shared.ts for the sources). The quote side of every
// curve trade, gross of fees: what a buyer paid in, what the curve paid out on a sell before fees. Swaps
// after graduation happen on the MegaPump DEX and are counted by the megapump-dex listing.

const fetch = async (options: FetchOptions) => {
  const { dailyVolume } = await collectCurveActivity(options)
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: 'Quote side (ETH, USDm or MEGA) of every bonding-curve buy and sell on MegaPump, gross of fees: the amount paid in on a buy (ethAmount of the Trade event, fees included) and the amount taken out of the curve on a sell, before fees. Trading after graduation happens on the MegaPump DEX and is not counted here.',
  },
}

export default adapter;
