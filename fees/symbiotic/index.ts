import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SYMBIOTIC_ABIs = {
    addEntity: "event AddEntity(address indexed entity)",
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const addEntityLogs = await options.getLogs({
        eventAbi: SYMBIOTIC_ABIs.addEntity,
        fromBlock: 20011312,
        noTarget: true,
        cacheInCloud: true,
    });

    const entities = addEntityLogs.map(log => log.entity.toLowerCase());

    // DistributeRewards(address indexed network, address indexed token, uint256 distributeAmount, uint256 adminFeeAmount, uint48 timestamp)
    const rewardDistributionLogs = await options.getLogs({
        topic: "0x52c39ebed294659631d22a2341c526a86ab683888dccb1429ac42c6e413d4b7b",
        noTarget: true,
    });

    // DistributeRewards(address network, address indexed tokenAddress, uint48 indexed eraIndex, uint48 indexed epoch, uint256 amount, bytes data)
    // Legacy Tanssi-style vaults, e.g. 0xd8f012e4483366b06355aba43ebe3661c5a5e9bf. Data word 1 is `amount`, gross of any admin fee the event does not separate.
    const tanssiRewardDistributionLogs = await options.getLogs({
        topic: "0x6a4b9b1f4e6e9369e7cc09dfda8ca9def764110609845dca69c2ae408ad4dcac",
        noTarget: true
    });

    rewardDistributionLogs.forEach(log => {
        if (!entities.includes(log.address)) return;
        const token = "0x" + log.topics[2].slice(-40);
        const distributeAmount = BigInt(log.data.slice(0, 66));
        const adminFeeAmount = BigInt("0x" + log.data.slice(66, 130));

        dailySupplySideRevenue.add(token, distributeAmount, 'Rewards Distributed To Stakers');
        dailySupplySideRevenue.add(token, adminFeeAmount, 'Admin Fees');
    });

    tanssiRewardDistributionLogs.forEach(log => {
        if (!entities.includes(log.address)) return;
        const token = "0x" + log.topics[1].slice(-40);
        const amount = BigInt("0x" + log.data.slice(66, 130));
        dailySupplySideRevenue.add(token, amount, 'Rewards Distributed (Gross)');
    })

    dailyFees.add(dailySupplySideRevenue);

    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "All network rewards distributed through Symbiotic vaults, including the vault admin fee.",
    Revenue: "Symbiotic keeps no share of the rewards distributed through its vaults, so revenue is zero.",
    SupplySideRevenue: "Network rewards distributed through Symbiotic vaults: the stakers' share plus the vault admin fee.",
};

const breakdownMethodology = {
    Fees: {
        'Rewards Distributed To Stakers': 'Network rewards distributed to stakers through Symbiotic vaults.',
        'Rewards Distributed (Gross)': 'Network rewards distributed through legacy vaults, gross of any admin fee.',
        'Admin Fees': 'Share of the distributed rewards kept as a vault admin fee.',
    },
    SupplySideRevenue: {
        'Rewards Distributed To Stakers': 'Network rewards distributed to stakers through Symbiotic vaults.',
        'Rewards Distributed (Gross)': 'Network rewards distributed through legacy vaults, gross of any admin fee.',
        'Admin Fees': 'Share of the distributed rewards kept as a vault admin fee.',
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2024-06-03',
    methodology,
    breakdownMethodology,
}

export default adapter;