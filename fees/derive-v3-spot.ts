import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { deriveFeesMethodology, getDeriveFees } from "../helpers/derive";

// USDC-quoted pairs only, so price is USD
const fetch = (options: FetchOptions) => getDeriveFees(options, "erc20", (t) => t.instrument_name.endsWith("-USDC"));

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.LYRA]: { start: "2024-07-12", deadFrom: "2026-10-06" }, // no v2 spot listing, history stays on Derive Chain
    [CHAIN.DERIVE_V3]: { start: "2026-10-06" },
  },
  ...deriveFeesMethodology("spot"),
};

export default adapter;
