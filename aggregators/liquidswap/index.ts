import { ethers } from "ethers";
import {
    FetchOptions,
    FetchResultVolume,
    SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SwapExecutedEvent =
    "event SwapExecuted(address indexed sender, address input_token_address, uint256 input_token_amount, address output_token_address, uint256 output_token_amount, uint256 timestamp)";

const LIQUIDSWAP_ADDRESS = "0x744489ee3d540777a66f2cf297479745e0852f7a";

const iface = new ethers.Interface([SwapExecutedEvent]);

const fetch: any = async (
    options: FetchOptions
): Promise<FetchResultVolume> => {
    const dailyVolume = options.createBalances();

    const logs: any[] = await options.getLogs({
        targets: [LIQUIDSWAP_ADDRESS],
        eventAbi: SwapExecutedEvent,
        entireLog: true,
    });

    logs.forEach((log) => {
        const parsed = iface.parseLog(log);
        if (!parsed) return;

        // Add output token volume
        dailyVolume.add(
            parsed.args.output_token_address,
            parsed.args.output_token_amount
        );
    });

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch: fetch,
            start: "2025-04-02",
            meta: {
                methodology: {
                    Volume: "Volume is calculated from SwapExecuted events emitted by the LiquidSwap aggregator contract. Each event contains the complete swap details including input token address, input token amount, output token address, and output token amount, making it straightforward to track the total value of tokens swapped through the protocol.",
                },
            },
        },
    },
};

export default adapter;
