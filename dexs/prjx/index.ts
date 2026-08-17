import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchProjectXPools } from "../../helpers/prjx";

// Project X is a Uniswap-V3-style AMM on Hyperliquid L1, tracked on DefiLlama
// for TVL but absent from /dexs. Sum the per-pool rolling-24h USD volume.
const fetch = async () => {
  const dailyVolume = (await fetchProjectXPools()).reduce((acc, pool) => {
    const volume = Number(pool.volume24h);
    if (!Number.isFinite(volume)) throw new Error(`Project X: invalid volume24h ${pool.volume24h}`);
    return acc + volume;
  }, 0);
  return { dailyVolume };
};

const methodology = {
  Volume: "Sum of the trailing-24h swap volume across Project X's pools (per-pool volume24h, USD), from the Project X pools API.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      // The API exposes only a rolling 24h snapshot, so run at current time.
      runAtCurrTime: true,
      start: '2025-07-08',
    },
  },
  methodology,
};

export default adapter;
