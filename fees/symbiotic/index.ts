import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const logs = await options.getLogs({
        topic: "0x52c39ebed294659631d22a2341c526a86ab683888dccb1429ac42c6e413d4b7b",
        noTarget: true,
    });

    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    logs.forEach(log => {
        const token = "0x" + log.topics[2].slice(-40);
        const distributeAmount = BigInt(log.data.slice(0, 66));
        const adminFeeAmount = BigInt("0x" + log.data.slice(66, 130));

        dailySupplySideRevenue.add(token, distributeAmount);
        dailyFees.add(token, adminFeeAmount);
    });

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
    start: '2025-07-28',
    methodology
}

export default adapter;