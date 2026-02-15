import { CHAIN } from "../../helpers/chains";
import type {
    FetchOptions,
    FetchResult,
    SimpleAdapter,
} from "../../adapters/types";
import ADDRESSES from '../../helpers/coreAssets.json'
import { METRIC } from "../../helpers/metrics";

const ABI = {
    FEE_COLLECTED: "event FeeCollected (uint256 amount,address indexed treasury)",
    REWARD_SNAPSHOT: "event RewardsSnapshot (uint256 reward_amount, uint256 snapshot_id, uint256 acc_reward_scaled)"
};

const REWARDS_DISTRIBUTOR = "0xA7c68a960bA0F6726C4b7446004FE64969E2b4d4";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {

    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const swapper = await options.api.call({
        target: REWARDS_DISTRIBUTOR,
        abi:"address:swapper_contract_address"
    });

    const feeCollectedLogs = await options.getLogs({
        eventAbi: ABI.FEE_COLLECTED,
        target: swapper,
    });

    const rewardLogs = await options.getLogs({
        eventAbi: ABI.REWARD_SNAPSHOT,
        target: REWARDS_DISTRIBUTOR
    });

    feeCollectedLogs.forEach((feeCollected: any) => {
        dailyRevenue.add(ADDRESSES.base.USDC, feeCollected.amount, METRIC.PROTOCOL_FEES)
    });

    rewardLogs.forEach((reward: any) => {
        dailySupplySideRevenue.add(ADDRESSES.base.USDC, reward.reward_amount, METRIC.STAKING_REWARDS)
    });

    const dailyFees = dailyRevenue.clone();
    dailyFees.addBalances(dailySupplySideRevenue, METRIC.STAKING_REWARDS);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue
    };
}

const methodology = {
    Fees: "Aerodrome weekly rewards received by veAero staked in the pool",
    Revenue: "5% of the rewards going to treasury",
    ProtocolRevenue: "5% of the rewards going to treasury",
    SupplySideRevenue: "Rewards post fee claimable by veAero stakers"
};

const breakdownMethodology = {
    Fees: {
        [METRIC.STAKING_REWARDS]: 'Weekly Aerodrome rewards earned from veAero tokens staked in the Autopilot pool',
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: '5% performance fee on Aerodrome rewards, collected by protocol treasury',
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: '5% performance fee on Aerodrome rewards, collected by protocol treasury',
    },
    SupplySideRevenue: {
        [METRIC.STAKING_REWARDS]: '95% of Aerodrome rewards distributed to veAero stakers after protocol fee',
    }
};

const adapter: SimpleAdapter = {
    version: 1, //rewards are weekly once
    fetch,
    chains: [CHAIN.BASE],
    start: '2025-07-24',
    methodology,
    breakdownMethodology
}

export default adapter;