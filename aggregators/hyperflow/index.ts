import {
    FetchOptions,
    FetchResult,
    SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const SwapExecutedEvent =
    "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)";

const ROUTER_AGGREGATOR = "0x980B9271A33c4B31214301fAE584B18dBB9731eC";

const fetch: any = async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();

    // Get Swapped events for volume
    const swapLogs = await options.getLogs({
        target: ROUTER_AGGREGATOR,
        eventAbi: SwapExecutedEvent,
    });
    for (const swapLog of swapLogs) {
        addOneToken({ chain: options.chain, balances: dailyVolume, token0: swapLog.srcToken, amount0: swapLog.spentAmount, token1: swapLog.dstToken, amount1: swapLog.returnAmount })
    }

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    start: "2025-06-08",
    methodology: {
        Volume: "Volume is calculated from Swapped events emitted by the HyperFlow aggregator contract.",
    },
    chains: [CHAIN.HYPERLIQUID],
};

export default adapter;
