import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

// https://www.tread.fi/
const HL_BUILDER_ADDRESS = "0x999a4b5f268a8fbf33736feff360d462ad248dbf";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: HL_BUILDER_ADDRESS,
    });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: "Trading fees paid by users for perps in Tread.fi perps trading terminal.",
  Revenue:
    "Fees collected by Tread.fi from Hyperliquid Perps as Builder Revenue.",
  ProtocolRevenue:
    "Fees collected by Tread.fi from Hyperliquid Perps as Builder Revenue.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-08-01",
  methodology,
  doublecounted: true,
};

export default adapter;
