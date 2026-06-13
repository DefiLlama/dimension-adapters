import { Adapter, FetchV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const volumeEndpoint = "https://api.venum.dev/v1/stats/volume";

const fetch: FetchV2 = async ({ startTimestamp, endTimestamp }) => {
    const stats = await httpGet(volumeEndpoint, {
        params: {
            from: startTimestamp,
            to: endTimestamp - 1,
        },
    });

    if (!stats) {
        throw new Error('No stats found');
    }

    return {
        dailyVolume: stats.volumeUsd,
    };
};

const methodology = {
    Volume:
        "Volume routed via the Venum aggregator frontend/API to underlying Solana DEX programs (Orca, Meteora, Raydium, etc). Each swap is recorded server-side only after the transaction is confirmed on-chain (signature verified via /v1/tx/:signature), priced from live pool quotes, deduped by signature, and served from /v1/stats/volume.",
};

const adapter: Adapter = {
    version: 2,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2026-04-01',
    methodology,
};

export default adapter;
