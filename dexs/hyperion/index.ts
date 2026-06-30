import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const BASE_URL =
  "https://api.hyperion.xyz/base/data/public/defillama/volume-fee-stat";

// Hyperion takes a 20% protocol fee from swap fees and the remaining 80% is paid to LPs.
const PROTOCOL_FEE_SHARE = 0.2;

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees } = await fetchURL(
    `${BASE_URL}?timestamp=${options.startOfDay}`,
  );
  const fees = Number(dailyFees);
  const dailyProtocolRevenue = fees * PROTOCOL_FEE_SHARE;

  return {
    dailyVolume,
    dailyFees: fees,
    dailySupplySideRevenue: fees * (1 - PROTOCOL_FEE_SHARE),
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.APTOS],
  start: "2025-02-04",
  methodology: {
    Volume: "Sum of swap volume across all Hyperion concentrated-liquidity pools.",
    Fees: "Swap fees paid by traders across all pool fee tiers.",
    SupplySideRevenue: "80% of swap fees distributed to in-range liquidity providers.",
    Revenue: "20% protocol fee taken from swap fees.",
    ProtocolRevenue: "20% protocol fee taken from swap fees and sent to the Hyperion treasury.",
  },
};

export default adapter;
