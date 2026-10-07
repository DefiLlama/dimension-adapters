import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { dayOf, SOHEIL_CHAINS, SOHEIL_START, SOHEIL_VOLUME_API, SoheilDay } from "../../helpers/aggregators/soheil";

/**
 * Soheil.fi (https://soheil.fi): cross-chain transfers routed through the bridges and intent networks it compares
 * (LI.FI, Rango, NEAR Intents, Hyperlane for Bittensor). Counted on the source chain, by the amount sent, for trades
 * the Soheil server verified on-chain. Same-chain swaps are in aggregators/soheil. Public endpoint, no key.
 */
const fetch = async (options: FetchOptions) => {
  const days: SoheilDay[] = options.preFetchedResults;
  const day = days.find((d) => d.day === dayOf(options.toTimestamp));
  const dailyBridgeVolume = day?.bridges
    .filter((b) => SOHEIL_CHAINS[String(b.fromChainId)] === options.chain)
    .reduce((sum, b) => sum + b.volumeUsd, 0) ?? 0;
  return { dailyBridgeVolume };
};

const prefetch = async (_: FetchOptions) => httpGet(SOHEIL_VOLUME_API);

const adapter: SimpleAdapter = {
  version: 1,
  adapter: Object.fromEntries([...new Set(Object.values(SOHEIL_CHAINS))].map((chain) => [chain, { fetch, start: SOHEIL_START }])),
  prefetch,
};

export default adapter;
