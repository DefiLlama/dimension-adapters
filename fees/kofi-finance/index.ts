import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const config_rule = {
    headers: {
        'user-agent': 'axios/1.6.7'
    }
}

// on-chain source if the API disappears: 0x2cc52445acc4c5e5817a0ac475976fbef966fedb6e30e7db792e10619c76181f::rewards_manager
const api_url = "https://api-production-f74f.up.railway.app/api/v1/fee";

interface IFeeData {
    fee: number; // staking rewards for one Aptos epoch, in APT (~7.9% APY on 8.09M APT staked in Oct 2025)
    timestamp: number;
}

const fetch = async (options: FetchOptions) => {
    const { fee } = await httpGet(`${api_url}?timestamp=${options.toTimestamp}`, config_rule)
    if (!Array.isArray(fee)) throw new Error(`Kofi fee API returned no data for ${options.dateString}`)

    const rewardsApt = fee.reduce((partialSum: number, a: IFeeData) => partialSum + a.fee, 0);

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()

    dailyFees.addCGToken('aptos', rewardsApt, METRIC.STAKING_REWARDS)
    dailyRevenue.addCGToken('aptos', rewardsApt * 0.10, 'Staking Rewards To Treasury') // 10% of staking rewards
    dailySupplySideRevenue.addCGToken('aptos', rewardsApt * 0.90, 'Staking Rewards To Stakers') // 90% of staking rewards

    return {
        dailyFees,
        dailyUserFees: dailyFees.clone(),
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue.clone(),
        dailySupplySideRevenue,
    };
}

const methodology = {
    Fees: "Total staking rewards",
    Revenue: "10% of total staking rewards",
    ProtocolRevenue: "10% of total staking rewards goes to the DAO Treasury",
    SupplySideRevenue: "90% of total staking rewards goes to stakers",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.STAKING_REWARDS]: "APT staking rewards earned by the APT staked through Kofi.",
    },
    UserFees: {
        [METRIC.STAKING_REWARDS]: "APT staking rewards earned by the APT staked through Kofi.",
    },
    Revenue: {
        'Staking Rewards To Treasury': "10% of APT staking rewards, kept by the Kofi DAO treasury.",
    },
    ProtocolRevenue: {
        'Staking Rewards To Treasury': "10% of APT staking rewards, sent to the Kofi DAO treasury.",
    },
    SupplySideRevenue: {
        'Staking Rewards To Stakers': "90% of APT staking rewards, passed on to Kofi stakers.",
    },
}

const adapter: Adapter = {
    version: 1,
    fetch,
    chains: [CHAIN.APTOS],
    start: '2025-05-14',
    deadFrom: '2026-07-25',
    methodology,
    breakdownMethodology,
}

export default adapter;
