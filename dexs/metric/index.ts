import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { addOneToken } from "../../helpers/prices";

const API_BASE = "https://api.metric.xyz";

const chainConfig: Record<string, { name: string, start: string }> = {
    [CHAIN.ETHEREUM]: { name: "ethereum", start: "2026-02-23" },
    [CHAIN.BASE]: { name: "base", start: "2026-04-05" },
    [CHAIN.ARBITRUM]: { name: "arbitrum", start: "2026-02-17" },
    [CHAIN.BSC]: { name: "bsc", start: "2026-02-23" },
    [CHAIN.AVAX]: { name: "avax", start: "2026-02-23" },
    [CHAIN.POLYGON]: { name: "polygon", start: "2026-02-23" },
    [CHAIN.MEGAETH]: { name: "megaeth", start: "2026-02-23" },
    [CHAIN.HYPERLIQUID]: { name: "hyperevm", start: "2026-03-26" },
    [CHAIN.MONAD]: { name: "monad", start: "2026-03-30" },
};

const SwapEvent =
    "event Swap(address sender, address recipient, bool exactInput, int128 amount0Delta, int128 amount1Delta, int16 newTick, uint104 newPositionInBin)";

const methodology = {
    Volume:
        "Sum of all input token amounts from Swap events across every pool deployed by the Metric factory.",
};

interface PoolMeta {
    poolAddress: string;
    token0: string;
    token1: string;
}

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const chainName = chainConfig[options.chain].name;

    const pools: PoolMeta[] = await httpGet(`${API_BASE}/${chainName}/metadata`);

    if (!pools.length) return { dailyVolume };

    const poolAddresses = pools.map((p) => p.poolAddress);
    const tokensByIndex = pools.map((p) => ({ token0: p.token0, token1: p.token1 }));

    const allLogs = await options.getLogs({
        targets: poolAddresses,
        eventAbi: SwapEvent,
        flatten: false,
    });

    allLogs.forEach((logs: any[], index: number) => {
        if (!logs.length) return;
        const { token0, token1 } = tokensByIndex[index];
        for (const log of logs) {
            const amount0 = BigInt(log.amount0Delta);
            const amount1 = BigInt(log.amount1Delta);
            addOneToken({ balances: dailyVolume, token0, amount0, token1, amount1 });
        }
    });

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    pullHourly: true,
    adapter: chainConfig,
    methodology,
};

export default adapter;
