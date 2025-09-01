import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const PRIZE_POOL = {
    'arbitrum': '0x52e7910c4c287848c8828e8b17b8371f4ebc5d42',
    'base': '0x45b2010d8a4f08b53c9fa7544c51dfd9733732cb',
    'ethereum': '0x7865d01da4c9ba2f69b7879e6d2483ab6b354d95',
    'xdai': '0x0c08c2999e1a14569554eddbcda9da5e1918120f',
    'optimism': '0xF35fE10ffd0a9672d0095c435fd8767A7fe29B55',
    'scroll': '0xa6ecd65c3eecdb59c2f74956ddf251ab5d899845',
    'wc': '0x99ffb0a6c0cd543861c8de84dd40e059fd867dcf'
};

const EVENT_ABI = {
    CONTRIBUTE_PRIZE_TOKENS: 'event ContributePrizeTokens (address indexed vault, uint24 indexed drawId, uint256 amount)',
    CLAIMED_PRIZE: 'event ClaimedPrize (address indexed vault,address indexed winner, address indexed recipient, uint24 drawId, uint8 tier, uint32 prizeIndex, uint152 payout, uint96 claimReward, address claimRewardRecipient)'
};

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

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

    const prizeClaimLogs = await options.getLogs({
        target: PRIZE_POOL[options.chain],
        eventAbi: EVENT_ABI.CLAIMED_PRIZE,
    });

    prizeClaimLogs.forEach(prizeClaim => {
        dailySupplySideRevenue.add(prizeToken, prizeClaim.claimReward)
    });

    return {
        dailyFees,
        dailyRevenue: 0,
        dailyProtocolRevenue: 0,
        dailySupplySideRevenue
    };
}

const methodology = {
    Fees: "All the yields earned by pooltogether's assets",
    Revenue: "Pooltogether doesnt charge any fee",
    ProtocolRevenue: "Pooltogether doesnt charge any fee",
    SupplySideRevenue: "All the lottery rewards claimed by depositors",
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.ETHEREUM, CHAIN.XDAI, CHAIN.OPTIMISM, CHAIN.SCROLL, CHAIN.WC],
    start: "2024-04-18",
    methodology
};

export default adapter;