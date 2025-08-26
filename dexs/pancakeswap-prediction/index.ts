import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'

const PCS_BNB_PREDICTION_CONTRACT = "0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA";
const EVENT_ABI = {
    REWARDS_CALCULATED: "event RewardsCalculated (uint256 indexed epoch, uint256 rewardBaseCalAmount, uint256 rewardAmount, uint256 treasuryAmount)",
    BET_BEAR: "event BetBear (address indexed sender,uint256 indexed epoch, uint256 amount)",
    BET_BULL: "event BetBull (address indexed sender,uint256 indexed epoch, uint256 amount)"
};

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyVolume = options.createBalances();
    const dailyRewards = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const bullLogs = await options.getLogs({
        target: PCS_BNB_PREDICTION_CONTRACT,
        eventAbi: EVENT_ABI.BET_BULL,
    });

    bullLogs.forEach(bet => {
        dailyVolume.add(ADDRESSES.bsc.WBNB, bet.amount);
    });

    const bearLogs = await options.getLogs({
        target: PCS_BNB_PREDICTION_CONTRACT,
        eventAbi: EVENT_ABI.BET_BEAR,
    });

    bearLogs.forEach(bet => {
        dailyVolume.add(ADDRESSES.bsc.WBNB, bet.amount);
    });

    const rewardLogs = await options.getLogs({
        target: PCS_BNB_PREDICTION_CONTRACT,
        eventAbi: EVENT_ABI.REWARDS_CALCULATED,
    });

    rewardLogs.forEach(reward => {
        dailyRewards.add(ADDRESSES.bsc.WBNB, reward.rewardAmount);
        dailySupplySideRevenue.add(ADDRESSES.bsc.WBNB, reward.treasuryAmount);
    });

    dailyFees.add(dailyVolume);
    dailyFees.subtract(dailyRewards);
    dailyFees.add(dailySupplySideRevenue);

    const dailyProtocolRevenue = dailyFees.clone();
    dailyProtocolRevenue.subtract(dailySupplySideRevenue);

    return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue, dailySupplySideRevenue };
}

const methodology = {
    Fees: "3% from winners' share and all the lost bets",
    Revenue: "All the fee is kept as revenue",
    ProtocolRevenue: "Lost bets are transferred to the treasury",
    SupplySideRevenue: "3% from winners' share goes to CAKE buyback and burn",
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.BSC],
    start: "2021-08-26",
    methodology
};

export default adapter;
