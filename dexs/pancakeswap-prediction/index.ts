import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'

// All three live markets are staked in native BNB and emit identical events.
const PREDICTION_MARKETS = [
  "0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA", // BNBUSD
  "0x48781a7d35f6137a9135Bbb984AF65fd6AB25618", // BTCUSD, live since 2025-09-08
  "0x7451F994A8D510CBCB46cF57D50F31F188Ff58F5", // ETHUSD, live since 2025-09-08
];

const EVENT_ABI = {
  REWARDS_CALCULATED: "event RewardsCalculated (uint256 indexed epoch, uint256 rewardBaseCalAmount, uint256 rewardAmount, uint256 treasuryAmount)",
  BET_BEAR: "event BetBear (address indexed sender,uint256 indexed epoch, uint256 amount)",
  BET_BULL: "event BetBull (address indexed sender,uint256 indexed epoch, uint256 amount)"
};

const METRIC = {
  PredictionFees: 'Prediction Fees',
  PredictionRevenueToHolders: 'Prediction Fees To Holders',
  BuyBackAndBurn: 'Buy Back And Burn CAKE',
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const bullLogs = await options.getLogs({
    targets: PREDICTION_MARKETS,
    eventAbi: EVENT_ABI.BET_BULL,
  });

  bullLogs.forEach(bet => {
    dailyVolume.add(ADDRESSES.bsc.WBNB, bet.amount);
  });

  const bearLogs = await options.getLogs({
    targets: PREDICTION_MARKETS,
    eventAbi: EVENT_ABI.BET_BEAR,
  });

  bearLogs.forEach(bet => {
    dailyVolume.add(ADDRESSES.bsc.WBNB, bet.amount);
  });

  const rewardLogs = await options.getLogs({
    targets: PREDICTION_MARKETS,
    eventAbi: EVENT_ABI.REWARDS_CALCULATED,
  });

  // treasuryAmount is the settled fee, so a tie (whole pot to treasury) is covered too
  rewardLogs.forEach(reward => {
    dailyFees.add(ADDRESSES.bsc.WBNB, reward.treasuryAmount);
  });

  return {
    dailyVolume,
    // both sides stake into one pot, and the pot is what settlement pays out
    dailyNotionalVolume: dailyVolume.clone(),
    dailyFees: dailyFees.clone(1, METRIC.PredictionFees),
    dailyRevenue: dailyFees.clone(1, METRIC.PredictionRevenueToHolders),
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyFees.clone(1, METRIC.BuyBackAndBurn),
  };
}

const methodology = {
  Volume: "Everything staked on the up and down sides of every five-minute round, across the BNB, BTC and ETH price markets.",
  NotionalVolume: "The size of each round's pot, which is what gets paid out when the round settles. Both sides stake into the same pot, so this matches the amount staked.",
  Fees: "3% of each round's total pot, counting both the winning and the losing stakes, taken when the round settles. If the price finishes exactly where it started, the whole pot goes to the treasury instead.",
  Revenue: "All of the fee is kept. Winners are paid out of the losing stakes, so there are no liquidity providers or market makers taking a share.",
  ProtocolRevenue: "Zero. Everything the treasury collects is spent on buying back and burning CAKE, so none of it is retained.",
  HoldersRevenue: "All the revenue goes to CAKE buyback and burn",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PredictionFees]: "3% of each round's total pot, taken when the round settles",
  },
  Revenue: {
    [METRIC.PredictionRevenueToHolders]: "All the fee is kept as revenue, it will be used to buy back and burn CAKE",
  },
  HoldersRevenue: {
    [METRIC.BuyBackAndBurn]: "All the revenue goes to CAKE buyback and burn",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: "2021-08-26",
  methodology,
  breakdownMethodology,
};

export default adapter;
