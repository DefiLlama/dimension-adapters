import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchSoheilDay, SOHEIL_CHAIN_LIST, SOHEIL_START } from "../../helpers/aggregators/soheil";

// Soheil.fi (https://soheil.fi, https://x.com/Soheil_fi): non-custodial swap and bridge aggregator over LI.FI, Rango,
// KyberSwap, Jupiter, NEAR Intents, STON.fi and its own routes. Same-chain swaps here; cross-chain transfers are in
// bridge-aggregators/soheil. Soheil has no contracts of its own (routes run through partner contracts), so the source is
// its public API of trades it verified on-chain.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.preFetchedResults?.[`swap:${options.chain}`] ?? 0;
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1, // the source only returns daily aggregates (per UTC day)
  fetch,
  chains: SOHEIL_CHAIN_LIST,
  start: SOHEIL_START,
  prefetch: fetchSoheilDay,
  doublecounted: true, // routed through aggregators and DEXs that DefiLlama already tracks
  methodology: {
    Volume:
      "USD value of same-chain swaps made through Soheil.fi, counted only when Soheil's server found the transaction on-chain, sent from the reporting wallet and routed with Soheil's integrator tag; priced at execution time. Source: https://soheil.fi/api/site/volume",
  },
};

export default adapter;
