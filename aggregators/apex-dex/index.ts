import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchVolumeFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";

// APEX DEX routes Cronos swaps through LI.FI with this integrator string.
const INTEGRATORS = ["apex-swap"];

// First completed apex-swap transfer on Cronos: 2026-11-06
const START = "2026-11-06";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = await fetchVolumeFromLIFIAPI(
    options.chain,
    options.startTimestamp,
    options.endTimestamp,
    INTEGRATORS,
    [],
    "same-chain",
  );
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CRONOS],
  start: START,
  doublecounted: true, // lifi
  methodology: {
    Volume:
      "USD value of completed same-chain swaps on Cronos routed through LI.FI with integrator apex-swap, taken from the LI.FI analytics API (sending.amountUSD).",
  },
};

export default adapter;