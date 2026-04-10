import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchLilSwapDailyMetrics, getLilSwapFees } from "../../helpers/lilswap";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.BASE,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
  CHAIN.OPTIMISM,
  CHAIN.XDAI,
  CHAIN.SONIC,
];

const adapter: Adapter = {
  version: 2,
  chains,
  start: "2025-01-01",
  methodology: {
    Fees: "Includes explicit LilSwap fees from confirmed swaps sourced from LilSwap's public daily metrics endpoint. Zero-fee swaps remain in volume but do not contribute to fees.",
    Revenue: "LilSwap retains 85% of explicit fees, sourced from LilSwap's public daily metrics endpoint.",
    ProtocolRevenue: "Same as LilSwap daily revenue because the endpoint reports LilSwap's retained fee share directly.",
    SupplySideRevenue: "Represents the 15% non-LilSwap side of the explicit fee split, sourced from LilSwap's public daily metrics endpoint.",
  },
  fetch: async (options: FetchOptions) => {
    const row = await fetchLilSwapDailyMetrics(options);
    return getLilSwapFees(row);
  },
};

export default adapter;
