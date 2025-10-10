import { CHAIN } from "../../helpers/chains";
import type {
    FetchOptions,
    FetchResult,
    SimpleAdapter,
} from "../../adapters/types";
import ADDRESSES from '../../helpers/coreAssets.json'

const ABI = {
    FEE_COLLECTED: "event FeeCollected (uint256 amount,address indexed treasury)",
    REWARD_SNAPSHOT: "event RewardsSnapshot (uint256 reward_amount, uint256 snapshot_id, uint256 acc_reward_scaled)"
};

const REWARDS_DISTRIBUTOR = "0xA7c68a960bA0F6726C4b7446004FE64969E2b4d4";
const SWAPPER = "0x04D07A6f489C36e1A7C8271a2438666868137b2F";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {

    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const feeCollectedLogs = await options.getLogs({
        eventAbi: ABI.FEE_COLLECTED,
        target: SWAPPER,
    });

    const rewardLogs = await options.getLogs({
        eventAbi: ABI.REWARD_SNAPSHOT,
        target: REWARDS_DISTRIBUTOR
    });

    feeCollectedLogs.forEach((feeCollected: any) => {
        dailyRevenue.add(ADDRESSES.base.USDC, feeCollected.amount)
    });

    rewardLogs.forEach((reward: any) => {
        dailySupplySideRevenue.add(ADDRESSES.base.USDC, reward.reward_amount)
    });

    const dailyFees = dailyRevenue.clone();
    dailyFees.add(dailySupplySideRevenue);

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

const adapter: SimpleAdapter = {
    version: 1, //rewards are weekly once
    fetch,
    chains: [CHAIN.BASE],
    start: '2025-07-24',
    methodology
}

export default adapter;