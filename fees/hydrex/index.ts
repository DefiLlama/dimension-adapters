import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';

const OPTION_EXERCISE_CONTRACT = '0xa1136031150e50b015b41f1ca6b2e99e49d8cb78';
const BRIBE_FACTORY = '0x58b4f302753003FFC1d70791775B93D0Edc87dC1';

const event_exercise = 'event Exercise(address indexed sender, address indexed recipient, uint256 amount, uint256 paymentAmount)';
const event_create_bribe = 'event CreateBribe(address indexed bribe, string bribeType, address indexed rewardToken0, address indexed rewardToken1)';
const event_reward_added = 'event RewardAdded(address indexed rewardToken, uint256 reward, uint256 startTimestamp)';

const fetch = async (options: FetchOptions) => {

  const dailyFees = options.createBalances();
  const dailyBribesRevenue = options.createBalances();

  const exerciseLogs = await options.getLogs({
    target: OPTION_EXERCISE_CONTRACT,
    eventAbi: event_exercise,
  });

  exerciseLogs.forEach((log: any) => {
    dailyFees.add(ADDRESSES.base.USDC, log.paymentAmount);
  });

  const toBlock = await options.getToBlock();
  const createBribeLogs = await options.getLogs({
    target: BRIBE_FACTORY,
    eventAbi: event_create_bribe,
    fromBlock: 35273788, // Earlier block for Hydrex on Base
    toBlock,
    cacheInCloud: true,
    skipIndexer: true,
  });

  const bribeContracts: string[] = createBribeLogs.map((e: any) => e.bribe.toLowerCase());

  for (const contract of bribeContracts) {
    const logs = await options.getLogs({
      target: contract,
      eventAbi: event_reward_added,
    });

    logs.forEach((log: any) => {
      dailyBribesRevenue.add(log.rewardToken, log.reward);      
    });
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyBribesRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.BASE],
  fetch,
  start: '2025-09-08',
  methodology: {
    Fees: "Total fees from DEX fees, option exercises, Omni Liquidity fees.",
    Revenue: "Protocol revenue from DEX fees, option exercises, and Omni Liquidity fees",
    ProtocolRevenue: "Revenue from option exercises allocated to the Strategic Protocol Reserve (treasury).",
    BribesRevenue: "bribes paid to governance token holders as incentives from DEX fees and Omni Liquidity fees.",
  }
};

export default adapter;
