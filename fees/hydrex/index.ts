import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';

const OPTION_EXERCISE_CONTRACT = '0xa1136031150e50b015b41f1ca6b2e99e49d8cb78';
const BRIBE_FACTORY = '0x58b4f302753003FFC1d70791775B93D0Edc87dC1';

const event_exercise = 'event Exercise(address indexed sender, address indexed recipient, uint256 amount, uint256 paymentAmount)';
const event_create_bribe = 'event CreateBribe(address indexed bribe, string bribeType, address indexed rewardToken0, address indexed rewardToken1)';
const event_reward_added = 'event RewardAdded(address indexed rewardToken, uint256 reward, uint256 startTimestamp)';

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, getToBlock } = options;

  const dailyRevenue = createBalances();

  // 1. Get options revenue from Option Exercise events (goes to SPR)
  const exerciseLogs = await getLogs({
    target: OPTION_EXERCISE_CONTRACT,
    eventAbi: event_exercise,
  });

  exerciseLogs.forEach((log: any) => {
    dailyRevenue.add(ADDRESSES.base.USDC, log.paymentAmount);
  });

  // 2. Get all bribe contracts from CreateBribe events (cache from start to avoid re-querying all history)
  const toBlock = await getToBlock();
  const createBribeLogs = await getLogs({
    target: BRIBE_FACTORY,
    eventAbi: event_create_bribe,
    fromBlock: 35273788, // Earlier block for Hydrex on Base
    toBlock,
    cacheInCloud: true,
    skipIndexer: true,
  });

  const bribeContracts: string[] = createBribeLogs.map((e: any) => e.bribe.toLowerCase());

  // 3. Get all RewardAdded events from bribe contracts (this accounts for DEX fees, omni fees, and bribes)
  const rewardLogs = await getLogs({
    targets: bribeContracts,
    eventAbi: event_reward_added,
  });

  rewardLogs.forEach((log: any) => {
    dailyRevenue.add(log.rewardToken, log.reward);
  });

  return {
    dailyFees: dailyRevenue,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-09-08',
    },
  },
  methodology: {
    Fees: "Total fees from DEX fees, option exercises (SPR), Omni Liquidity Fees, and bribe rewards",
    Revenue: "Total revenue from DEX fees, option exercises (SPR), Omni Liquidity Fees, and bribe rewards",
  }
};

export default adapter;
