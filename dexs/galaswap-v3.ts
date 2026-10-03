import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const GALA_SWAP_DAILY_API = "https://dex-backend-prod1.defi.gala.com/dex/pairs/volume-fees?date=";

async function fetch(options: FetchOptions) {
  const { volumeUSD, feesUSD } = await fetchURL(GALA_SWAP_DAILY_API + options.dateString);
  if (typeof volumeUSD !== "number" || typeof feesUSD !== "number")
    throw new Error(`galaswap: no daily volume and fees for ${options.dateString}`);

  return {
    dailyVolume: volumeUSD,
    dailyFees: feesUSD,
    dailyRevenue: 0,
    dailySupplySideRevenue: feesUSD,
    dailyProtocolRevenue: 0,
  }
}

const methodology = {
  Fees: "Swap fees paid by users",
  Revenue: "No revenue",
  Volume: "Galaswap trade volume",
  SupplySideRevenue: "All the fees goes to liquidity providers",
  ProtocolRevenue: "No protocol revenue",
};

export default {
  version: 1,
  fetch,
  start: '2025-09-03',
  chains: [CHAIN.GALA],
  methodology,
}
