import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const PRIZE_POOL = {
    [CHAIN.ARBITRUM]: '0x52e7910c4c287848c8828e8b17b8371f4ebc5d42',
    [CHAIN.BASE]: '0x45b2010d8a4f08b53c9fa7544c51dfd9733732cb',
    [CHAIN.ETHEREUM]: '0x7865d01da4c9ba2f69b7879e6d2483ab6b354d95',
    [CHAIN.XDAI]: '0x0c08c2999e1a14569554eddbcda9da5e1918120f',
    [CHAIN.OPTIMISM]: '0xF35fE10ffd0a9672d0095c435fd8767A7fe29B55',
    [CHAIN.SCROLL]: '0xa6ecd65c3eecdb59c2f74956ddf251ab5d899845',
    [CHAIN.WC]: '0x99ffb0a6c0cd543861c8de84dd40e059fd867dcf'
};

const EVENT_ABI = {
    CONTRIBUTE_PRIZE_TOKENS: 'event ContributePrizeTokens (address indexed vault, uint24 indexed drawId, uint256 amount)',
};

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();

    const prizeToken = await options.api.call({
        target: PRIZE_POOL[options.chain],
        abi: 'address:prizeToken'
    });

    const yieldLogs = await options.getLogs({
        target: PRIZE_POOL[options.chain],
        eventAbi: EVENT_ABI.CONTRIBUTE_PRIZE_TOKENS,
    });

    yieldLogs.forEach(yieldLog => {
        dailyFees.add(prizeToken, yieldLog.amount)
    });

    return {
        dailyFees,
        dailyRevenue: 0,
        dailyProtocolRevenue: 0,
        dailySupplySideRevenue: dailyFees
    };
}

const methodology = {
    Fees: "All the yields earned by pooltogether's assets",
    Revenue: "Pooltogether doesnt charge any fee",
    ProtocolRevenue: "Pooltogether doesnt charge any fee",
    SupplySideRevenue: "All the yields are distributed as lottery prize",
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    adapter: {
        [CHAIN.ARBITRUM]: { start: '2024-05-29' },
        [CHAIN.BASE]: { start: '2024-05-15' },
        [CHAIN.ETHEREUM]: { start: '2024-08-19' },
        [CHAIN.XDAI]: { start: '2024-09-11' },
        [CHAIN.OPTIMISM]: { start: '2024-04-18' },
        [CHAIN.SCROLL]: { start: '2024-09-11' },
        [CHAIN.WC]: { start: '2025-03-19' }
    },
    methodology
};

export default adapter;