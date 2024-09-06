import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { evmReceivedGasAndTokens } from "../helpers/token";

const adapter: Adapter = {
    version: 2,
    isExpensiveAdapter: true,
    adapter: {
        [CHAIN.OPTIMISM]: {
            fetch: evmReceivedGasAndTokens('0x00000000fcce7f938e7ae6d3c335bd6a1a7c593d', []), // actual protocol payments
            start: 0,
        },
        [CHAIN.BASE]: {
            fetch: evmReceivedGasAndTokens('0xbc698ce1933afb2980d4a5a0f85fea1b02fbb1c9', []), // zora rewards
            start: 0,
        }
    }
}

export default adapter;