import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { evmReceivedGasAndTokens } from "../helpers/token";

const adapter: Adapter = {
    version: 2,
    isExpensiveAdapter: true,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: evmReceivedGasAndTokens('0xca90d843288e35beeadfce14e5f906e3f1afc7cb', []),
                    },
    }
}

export default adapter;