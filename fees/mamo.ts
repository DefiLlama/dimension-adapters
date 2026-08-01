import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

const MAMO_MULTI_REWARDS = "0x7855B0821401Ab078f6Cf457dEAFae775fF6c7A3";
const MAMO_TOKEN = "0x7300B37DfdfAb110d83290A29DfB31B1740219fE";

const fetch = async (options: FetchOptions) => {

    // Aerodrome LP fees distributed to MAMO stakers
    const stakingRewards = await addTokensReceived({
        options,
        targets: [MAMO_MULTI_REWARDS],
        tokens: [MAMO_TOKEN, ADDRESSES.base.cbBTC],
    });

    const dailyFees = stakingRewards.clone(1, METRIC.STAKING_REWARDS);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyHoldersRevenue: dailyFees
    };
};

const methodology = {
    Fees: "Aerodrome LP fees distributed to MAMO stakers.",
    Revenue: "Aerodrome LP fees distributed to MAMO stakers.",
    HoldersRevenue: "Aerodrome LP trading fees distributed to MAMO stakers via the multi-rewards contract.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.STAKING_REWARDS]: 'Aerodrome LP fees distributed to MAMO stakers.',
    },
    Revenue: {
        [METRIC.STAKING_REWARDS]: 'Aerodrome LP fees distributed to MAMO stakers.',
    },
    HoldersRevenue: {
        [METRIC.STAKING_REWARDS]: 'Aerodrome LP fees distributed to MAMO stakers.',
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.BASE],
    fetch,
    start: "2025-07-18",
    methodology,
    breakdownMethodology,
    doublecounted: true, //aerodrome
};

export default adapter;
