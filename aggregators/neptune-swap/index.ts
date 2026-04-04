import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const AGGREGATOR_CONTRACT = "0xb3f2B217B024700b6B85bB0941d4958EF17214C1";

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const logs = await options.getLogs({
        target: AGGREGATOR_CONTRACT,
        eventAbi:
            "event SwapExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 taxCollected, uint256 timestamp)",
    });

    for (const log of logs) {
        dailyVolume.add(log.tokenOut, log.amountOut);
        dailyFees.add(log.tokenIn, log.taxCollected);
    }

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Volume: "Total volume of swaps executed by the aggregator.",
    Fees: "Fees collected from the input token (0.3% of amountIn).",
    UserFees: "User pays 0.3% of the volume as fees(tax).",
    Revenue: "All the fees are revenue",
    ProtocolRevenue: "All the revenue goes to protocol treasury",
}

const adapter: any = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.CRONOS],
    methodology,
    start: "2026-02-06",
};

export default adapter;
