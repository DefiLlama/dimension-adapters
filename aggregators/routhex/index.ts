import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Routhex is a Solana meta-aggregator: it compares quotes across underlying
// providers (Jupiter, DFlow, Autobahn, OKX) and returns the best route. Because it
// delegates execution to those providers' programs, a Routhex swap has no single
// on-chain program/event to decode on Dune. Volume is served from Routhex's own
// indexer, which persists every routed swap with its USD value; the endpoint sums
// usd_volume over the [start, end) window and returns it as `dailyVolume`.
const VOLUME_ENDPOINT = "https://swap.io/internal-api/pulsar-persister-api/defillama/volume";

const fetch = async (options: FetchOptions) => {
  const res = await httpGet(
    `${VOLUME_ENDPOINT}?start=${options.startTimestamp}&end=${options.endTimestamp}`
  );
  return { dailyVolume: res.dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-10-01", // first swap volume observed in the indexer (Oct 2025)
  methodology: {
    Volume:
      "Sum of the USD value of all swaps routed by the Routhex aggregator, as recorded by Routhex's transaction indexer.",
  },
};

export default adapter;
