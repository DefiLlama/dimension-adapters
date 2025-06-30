import {
    FetchOptions,
    FetchResultVolume,
    SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SwapExecutedEvent =
    "event SwapExecuted(address indexed sender, address input_token_address, uint256 input_token_amount, address output_token_address, uint256 output_token_amount, uint256 timestamp)"

const LIQUIDSWAP_ADDRESS = "0x744489ee3d540777a66f2cf297479745e0852f7a"

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const dailyVolume = options.createBalances()

    const logs = await options.getLogs({ target: LIQUIDSWAP_ADDRESS, eventAbi: SwapExecutedEvent })
    logs.forEach((log) => {
        dailyVolume.add(log.input_token_address, log.input_token_amount)
    })

    return { dailyVolume }
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch: fetch,
            start: "2025-04-02",
            meta: {
                methodology: {
                    Volume: "Volume is calculated from SwapExecuted events emitted by the LiquidSwap aggregator contract.",
                },
            },
        },
    },
}

export default adapter
