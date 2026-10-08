// Derive v3 spot markets: trading fees, revenue, maker rebates and builder fees
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { deriveFeesMethodology, getDeriveFees } from "../helpers/derive";

// all spot pairs are quoted in USDC, so price is USD
const fetch = (options: FetchOptions) => getDeriveFees(options, "erc20", (t) => t.instrument_name.endsWith("-USDC"));

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.LYRA]: { start: "2024-07-12", deadFrom: "2026-10-06" }, // first spot trade on Derive (no v2 spot listing), settled on Derive Chain until the v3 cutover
    [CHAIN.ETHEREUM]: { start: "2026-10-06" }, // v3 custody and settlement proofs live on Ethereum mainnet
  },
  ...deriveFeesMethodology("spot"),
};

export default adapter;
