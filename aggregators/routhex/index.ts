import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Routhex is a Solana meta-aggregator: it compares quotes across underlying
// providers (Jupiter, DFlow, Autobahn) and returns the best route. Because it
// delegates execution to those providers' programs, a routhex swap has no single
// on-chain program/event that could be decoded on Dune. Volume is therefore
// served from routhex's own indexer, which persists every routed swap with its
// USD value. The endpoint sums usd_volume over the [start, end) window that
// DefiLlama's fetch() passes and returns it as `dailyVolume`.
const VOLUME_ENDPOINT = "https://swap.io/internal-api/pulsar-persister-api/defillama/volume";

const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const res = await httpGet(
    `${VOLUME_ENDPOINT}?start=${fromTimestamp}&end=${toTimestamp}`
  );
  return { dailyVolume: res.dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2025-10-01", // first swap volume observed in the indexer (Oct 2025)
    },
  },
  methodology: {
    Volume:
      "Sum of the USD value of all swaps routed by the Routhex aggregator, as recorded by Routhex's transaction indexer.",
  },
};

export default adapter;
