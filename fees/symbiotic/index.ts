import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SYMBIOTIC_ABIs = {
    addEntity: "event AddEntity(address indexed entity)",
}

// Reward-distributor factories whose deployed entities emit the reward events
// tracked below. Each emits AddEntity(entity); passing them as `targets` avoids
// scanning every log on chain (noTarget).
const REWARD_FACTORIES = [
    '0xfeb871581c2ab2e1eee6f7ddc7e6246cfa087a23',
    '0xb1541d4a1f3a0fc41dcae8a75278fa0f000e5086',
    '0x7498227e40b764c32428baa5adb44c7a5bf28f5e',
];

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const addEntityLogs = await options.getLogs({
        eventAbi: SYMBIOTIC_ABIs.addEntity,
        targets: REWARD_FACTORIES,
        fromBlock: 20011312,
        cacheInCloud: true,
    });

    const entities = addEntityLogs.map(log => log.entity.toLowerCase());

    const rewardDistributionLogs = await options.getLogs({
        targets: entities,
        topic: "0x52c39ebed294659631d22a2341c526a86ab683888dccb1429ac42c6e413d4b7b",
    });

    const tanssiRewardDistributionLogs = await options.getLogs({
        targets: entities,
        topic: "0x6a4b9b1f4e6e9369e7cc09dfda8ca9def764110609845dca69c2ae408ad4dcac",
    });

    rewardDistributionLogs.forEach(log => {
        if (!entities.includes(log.address)) return;
        const token = "0x" + log.topics[2].slice(-40);
        const distributeAmount = BigInt(log.data.slice(0, 66));
        const adminFeeAmount = BigInt("0x" + log.data.slice(66, 130));

        dailySupplySideRevenue.add(token, distributeAmount);
        dailyFees.add(token, adminFeeAmount);
    });

    tanssiRewardDistributionLogs.forEach(log => {
        if (!entities.includes(log.address)) return;
        const token = "0x" + log.topics[1].slice(-40);
        const amount = BigInt("0x" + log.data.slice(66, 130));
        dailySupplySideRevenue.add(token, amount);
    })

    dailyFees.add(dailySupplySideRevenue);

    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "Includes admin fee and total rewards distributed",
    Revenue: "No revenue",
    SupplySideRevenue: "Rewards distributed to stakers and operators"
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2024-06-03',
    methodology
}

export default adapter;