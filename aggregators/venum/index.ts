import { Adapter, FetchV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const volumeEndpoint = "https://api.venum.dev/v1/stats/volume";

const fetch: FetchV2 = async ({ startTimestamp, endTimestamp }) => {
  const stats = await httpGet(volumeEndpoint, {
    params: {
      from: startTimestamp,
      to: endTimestamp,
    },
  });

  return {
    dailyVolume: stats?.volumeUsd,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2026-04-01',
      meta: {
        methodology: {
          Volume:
            "Volume routed via the Venum aggregator frontend/API to underlying Solana DEX programs (Orca, Meteora, Raydium, etc). Each swap is recorded server-side only after the transaction is confirmed on-chain (signature verified via /v1/tx/:signature), priced from live pool quotes, deduped by signature, and served from /v1/stats/volume.",
        },
      },
    },
  },
};

export default adapter;
