import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchSoheilDays, SOHEIL_CHAIN_LIST, SOHEIL_CHAINS, SOHEIL_START, SoheilDays } from "../../helpers/aggregators/soheil";

// Soheil.fi (https://soheil.fi, https://x.com/Soheil_fi): cross-chain transfers routed through the bridges and intent
// networks it compares (LI.FI, Rango, NEAR Intents, Symbiosis, Hyperlane for Bittensor). Same-chain swaps are in
// aggregators/soheil. Soheil has no contracts of its own, so the source is its public API of trades it verified on-chain.
const fetch = async (options: FetchOptions) => {
  const day = (options.preFetchedResults as SoheilDays)[options.dateString];
  const dailyBridgeVolume = (day?.bridges ?? [])
    .filter((b) => SOHEIL_CHAINS[String(b.fromChainId)] === options.chain)
    .reduce((sum, b) => sum + b.volumeUsd, 0);
  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 1, // the source only returns daily aggregates (per UTC day)
  fetch,
  chains: SOHEIL_CHAIN_LIST,
  start: SOHEIL_START,
  prefetch: fetchSoheilDays,
  methodology: {
    BridgeVolume:
      "USD value sent cross-chain through Soheil.fi, counted on the source chain and only when Soheil's server found the transaction on-chain, sent from the reporting wallet and routed with Soheil's integrator tag; priced at execution time. Source: https://soheil.fi/api/site/volume",
  },
};

export default adapter;
