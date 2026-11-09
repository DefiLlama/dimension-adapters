import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { deriveFeesMethodology, getDeriveFees } from "../helpers/derive";

// USDC-quoted pairs only, so price is USD
export const fetch = (options: FetchOptions) => getDeriveFees(options, "erc20", (t) => t.instrument_name.endsWith("-USDC"));

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.DERIVE_V3],
  start: "2026-10-06", // v3 cutover
  ...deriveFeesMethodology("spot"),
};

export default adapter;
