import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Kasseal: a KCC-20 token launchpad on Kaspa L1. Volume of its bonding curves only (graduated tokens trade on Kasseal
// pools, a separate listing).
//
// Source: Kasseal's indexer, trade-level and answerable for any past window (API docs:
// https://api.kasseal.com/v1/openapi.yaml, GET /metrics/flows). It answers 503 until it has indexed the whole window,
// so an incomplete window throws instead of being stored. Volume is one side of each trade, gross of the 1% fee: a buy
// is the KAS paid including the fee, a sell the KAS the curve paid out before the fee.
const FLOWS = "https://api.kasseal.com/v1/metrics/flows";

const fetch = async (options: FetchOptions) => {
  const res = await fetchURL(`${FLOWS}?from=${options.startTimestamp}&to=${options.endTimestamp}`);
  const curve = res?.curve;
  if (!curve) throw new Error(`kasseal: no flows for ${options.startTimestamp}-${options.endTimestamp}`);
  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken("kaspa", Number(curve.volumeSompi) / 1e8);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.KASPA],
  start: "2026-10-23",
  methodology: {
    Volume: "KAS traded in buys and sells on Kasseal bonding curves on Kaspa, one side per trade, fees included. Excludes pools after graduation.",
  },
};

export default adapter;
