import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const addEntityLogs = await options.getLogs({
        topic: "0xb919910dcefbf753bfd926ab3b1d3f85d877190c3d01ba1bd585047b99b99f0b",
        fromBlock: 20011312,
        noTarget: true,
    });
    const entities = addEntityLogs.map(log => "0x" + log.topics[1].slice(-40));

    const rewardDistributionLogs = await options.getLogs({
        topic: "0x52c39ebed294659631d22a2341c526a86ab683888dccb1429ac42c6e413d4b7b",
        noTarget: true,
    });

    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    rewardDistributionLogs.forEach(log => {
        if (!entities.includes(log.address)) return;
        const token = "0x" + log.topics[2].slice(-40);
        const distributeAmount = BigInt(log.data.slice(0, 66));
        const adminFeeAmount = BigInt("0x" + log.data.slice(66, 130));

        dailySupplySideRevenue.add(token, distributeAmount);
        dailyFees.add(token, adminFeeAmount);
    });

    const tassiRewardDistributionLogs = await options.getLogs({
        topic: "0x6a4b9b1f4e6e9369e7cc09dfda8ca9def764110609845dca69c2ae408ad4dcac",
        noTarget: true
    });

    tassiRewardDistributionLogs.forEach(log => {
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
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2024-06-03',
    methodology
}

export default adapter;