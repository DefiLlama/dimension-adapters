// Derive v3 perpetual markets: trading fees, revenue, maker rebates and builder fees
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { deriveFeesMethodology, getDeriveFees } from "../helpers/derive";

const fetch = (options: FetchOptions) => getDeriveFees(options, "perp");

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.DERIVE_V3], // v3 zkVM exchange, listed as its own chain like the v2 Derive Chain (lyra) it replaces
  start: "2026-10-06", // v3 cutover, the v2 listing (lyra-v2) is dead from this date
  ...deriveFeesMethodology("perpetual"),
};

export default adapter;
