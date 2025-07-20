import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getETHReceived } from "../helpers/token";

const meta = {
  methodology: {
    Fees: 'All fees paid by users for swapping, bridging in Rabby wallet.',
    Revenue: 'Fees collected by Rabby.',
    ProtocolRevenue: 'Fees collected by Rabby.',
  }
}

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
        dailyProtocolRevenue: dailyFees,
    };
};

const chains = [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.SONIC, CHAIN.OPTIMISM, CHAIN.MANTLE, CHAIN.AVAX, CHAIN.LINEA, CHAIN.POLYGON, CHAIN.BLAST, CHAIN.MANTA, CHAIN.BERACHAIN, CHAIN.UNICHAIN, CHAIN.ZKSYNC, CHAIN.SCROLL, CHAIN.XDAI, CHAIN.CRONOS, CHAIN.TAIKO, CHAIN.POLYGON_ZKEVM, CHAIN.ARBITRUM_NOVA, CHAIN.ABSTRACT]

const adapter: SimpleAdapter = {
    version: 2,
    adapter: chains.reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetchFees,
                meta,
            },
        };
    }, {}),
    isExpensiveAdapter: true
};

export default adapter;
