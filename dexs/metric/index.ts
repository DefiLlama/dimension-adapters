import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const chainConfig: Record<string, { start: string }> = {
    [CHAIN.ETHEREUM]: { start: "2026-02-23" },
    [CHAIN.BASE]: { start: "2026-04-05" },
    [CHAIN.ARBITRUM]: { start: "2026-02-17" },
    [CHAIN.BSC]: { start: "2026-02-23" },
    [CHAIN.AVAX]: { start: "2026-02-23" },
    [CHAIN.POLYGON]: { start: "2026-02-23" },
    [CHAIN.MEGAETH]: { start: "2026-02-23" },
    [CHAIN.HYPERLIQUID]: { start: "2026-03-26" },
    [CHAIN.MONAD]: { start: "2026-03-30" },
};

const InitializeTopic =
    "0x84a943c81b92b2786bc7029e8331096d28689c016f71cbb66a5d7498a20674f1";

const SwapEvent =
    "event Swap(address sender, address recipient, bool exactInput, int128 amount0Delta, int128 amount1Delta, int16 newTick, uint104 newPositionInBin)";

const methodology = {
    Volume:
        "Sum of all input token amounts from Swap events across every pool created by Metric. Pools are discovered on-chain from each pool's Initialize event.",
};

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const startTimestamp = Math.floor(new Date(`${chainConfig[options.chain].start}T00:00:00Z`).getTime() / 1000);
    const fromBlock = await sdk.blocks.getBlockNumber(options.chain, startTimestamp);
    const toBlock = await options.getEndBlock();

    const initLogs = await sdk.getEventLogs({
        chain: options.chain,
        noTarget: true,
        topic: InitializeTopic,
        entireLog: true,
        fromBlock,
        toBlock,
        cacheInCloud: true,
        maxBlockRange: 10000,
    });

    const tokensByPool: Record<string, { token0: string, token1: string }> = {};
    for (const log of initLogs) {
        tokensByPool[log.address.toLowerCase()] = {
            token0: `0x${log.topics[1].slice(26)}`,
            token1: `0x${log.topics[2].slice(26)}`,
        };
    }

    const poolAddresses = Object.keys(tokensByPool);
    if (!poolAddresses.length) return { dailyVolume };

    const allLogs = await options.getLogs({
        targets: poolAddresses,
        eventAbi: SwapEvent,
        flatten: false,
    });

    allLogs.forEach((logs: any[], index: number) => {
        if (!logs.length) return;
        const { token0, token1 } = tokensByPool[poolAddresses[index]];
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
