import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getETHReceived } from "../helpers/token";

const feeWallet = "0x39041f1b366fe33f9a5a79de5120f2aee2577ebc"

const fetchFees = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    await addTokensReceived({
        options,
        targets: [feeWallet],
        balances: dailyFees,
    });
    await getETHReceived({ options, balances: dailyFees, target: feeWallet })
    return {
        dailyFees,
        dailyRevenue: dailyFees,
    };
};

const chains = [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.BASE, CHAIN.ARBITRUM]

const adapter: SimpleAdapter = {
    version: 2,
    adapter: chains.reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetchFees,
            },
        };
    }, {}),
    isExpensiveAdapter: true
};

export default adapter;
