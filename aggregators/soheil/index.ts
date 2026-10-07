import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { dayOf, SOHEIL_CHAINS, SOHEIL_START, SOHEIL_VOLUME_API, SoheilDay } from "../../helpers/aggregators/soheil";

/**
 * Soheil.fi (https://soheil.fi): non-custodial swap and bridge aggregator over LI.FI, Rango, KyberSwap, Jupiter,
 * NEAR Intents, STON.fi and its own routes. Same-chain swaps only here; cross-chain transfers are in
 * bridge-aggregators/soheil. Volume = trades the Soheil server verified on-chain (transaction found, sent from the
 * reporting wallet, routed with Soheil's integrator tag), priced at execution time. Public endpoint, no key.
 */
const fetch = async (options: FetchOptions) => {
  const days: SoheilDay[] = options.preFetchedResults;
  const day = days.find((d) => d.day === dayOf(options.toTimestamp));
  const dailyVolume = day?.swaps
    .filter((s) => SOHEIL_CHAINS[String(s.chainId)] === options.chain)
    .reduce((sum, s) => sum + s.volumeUsd, 0) ?? 0;
  return { dailyVolume };
};

const prefetch = async (_: FetchOptions) => httpGet(SOHEIL_VOLUME_API);

const adapter: SimpleAdapter = {
  version: 1,
  doublecounted: true, // routed through other aggregators and DEXs that DefiLlama already tracks
  adapter: Object.fromEntries([...new Set(Object.values(SOHEIL_CHAINS))].map((chain) => [chain, { fetch, start: SOHEIL_START }])),
  prefetch,
};

export default adapter;
