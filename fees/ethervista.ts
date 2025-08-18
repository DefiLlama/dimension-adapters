import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { evmReceivedGasAndTokens } from "../helpers/token";

const adapter: Adapter = {
    version: 1,
    isExpensiveAdapter: true,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: async (_: any, _1: any, options: FetchOptions) => {
                return evmReceivedGasAndTokens('0xca90d843288e35beeadfce14e5f906e3f1afc7cb', [])(options)
            },
        },
    }
}

export default adapter;