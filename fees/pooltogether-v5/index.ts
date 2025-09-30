import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type POOLTOGETHER_CHAIN = CHAIN.ARBITRUM | CHAIN.BASE | CHAIN.ETHEREUM | CHAIN.XDAI | CHAIN.OPTIMISM | CHAIN.SCROLL | CHAIN.WC;

const PRIZE_POOL: Record<POOLTOGETHER_CHAIN, Lowercase<string>> = {
    [CHAIN.ARBITRUM]: '0x52e7910c4c287848c8828e8b17b8371f4ebc5d42',
    [CHAIN.BASE]: '0x45b2010d8a4f08b53c9fa7544c51dfd9733732cb',
    [CHAIN.ETHEREUM]: '0x7865d01da4c9ba2f69b7879e6d2483ab6b354d95',
    [CHAIN.XDAI]: '0x0c08c2999e1a14569554eddbcda9da5e1918120f',
    [CHAIN.OPTIMISM]: '0xf35fe10ffd0a9672d0095c435fd8767a7fe29b55',
    [CHAIN.SCROLL]: '0xa6ecd65c3eecdb59c2f74956ddf251ab5d899845',
    [CHAIN.WC]: '0x99ffb0a6c0cd543861c8de84dd40e059fd867dcf'
};

const POOL_VAULTS: Record<POOLTOGETHER_CHAIN, Lowercase<string>> = {
    [CHAIN.ARBITRUM]: '0x97a9c02cfbbf0332d8172331461ab476df1e8c95',
    [CHAIN.BASE]: '0x6b5a5c55e9dd4bb502ce25bbfbaa49b69cf7e4dd',
    [CHAIN.ETHEREUM]: '0x9ee31e845ff1358bf6b1f914d3918c6223c75573',
    [CHAIN.XDAI]: '0xb75af20ecadabed9049cc2f50e38bad2768b35cf',
    [CHAIN.OPTIMISM]: '0xa52e38a9147f5ea9e0c5547376c21c9e3f3e5e1f',
    [CHAIN.SCROLL]: '0x29499e2eb8ff1d076a35c275aeddd613afb1fa9b',
    [CHAIN.WC]: '0x0045cc66ecf34da9d8d89ad5b36cb82061c0907c'
};

const EVENT_ABI = {
    CONTRIBUTE_PRIZE_TOKENS: 'event ContributePrizeTokens (address indexed vault, uint24 indexed drawId, uint256 amount)',
};

async function fetch(options: FetchOptions) {
    const allContributions = options.createBalances();
    const poolVaultContributions = options.createBalances();

    const prizePool = PRIZE_POOL[options.chain as POOLTOGETHER_CHAIN];
    const poolVault = POOL_VAULTS[options.chain as POOLTOGETHER_CHAIN];

    const prizeToken = await options.api.call({
        target: prizePool,
        abi: 'address:prizeToken'
    });

    const yieldLogs = await options.getLogs({
        target: prizePool,
        eventAbi: EVENT_ABI.CONTRIBUTE_PRIZE_TOKENS,
    });

    yieldLogs.forEach(yieldLog => {
        allContributions.add(prizeToken, yieldLog.amount);

        if (yieldLog.vault.toLowerCase() === poolVault) {
            poolVaultContributions.add(prizeToken, yieldLog.amount);
        }
    });

    const regularVaultContributions = allContributions.clone();
    regularVaultContributions.subtract(poolVaultContributions);

    return {
        dailyFees: allContributions,
        dailyRevenue: poolVaultContributions,
        dailyProtocolRevenue: 0,
        dailyHoldersRevenue: poolVaultContributions,
        dailySupplySideRevenue: regularVaultContributions
    };
}

const methodology = {
    Fees: "All the yields earned by pooltogether's assets",
    Revenue: "Users in POOL vaults get a % of all prize odds (typically range from 4%-12%)",
    ProtocolRevenue: "Pooltogether doesn't charge any fees",
    HoldersRevenue: "Users in POOL vaults get a % of all prize odds (typically range from 4%-12%)",
    SupplySideRevenue: "All the yields are distributed as lottery prizes",
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
    methodology,
    allowNegativeValue: true, // casino can lose money
};

export default adapter;