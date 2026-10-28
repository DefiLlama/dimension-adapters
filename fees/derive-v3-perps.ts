import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { deriveFeesMethodology, getDeriveFees } from "../helpers/derive";

const fetch = (options: FetchOptions) => getDeriveFees(options, "perp");

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.DERIVE_V3],
  start: "2026-10-06", // v3 cutover
  ...deriveFeesMethodology("perpetual"),
};

export default adapter;
