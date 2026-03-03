import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';

const OPTION_EXERCISE_CONTRACT = '0xa1136031150e50b015b41f1ca6b2e99e49d8cb78';
const BRIBE_FACTORY = '0x58b4f302753003FFC1d70791775B93D0Edc87dC1';

const event_exercise = 'event Exercise(address indexed sender, address indexed recipient, uint256 amount, uint256 paymentAmount)';
const event_create_bribe = 'event CreateBribe(address indexed bribe, string bribeType, address indexed rewardToken0, address indexed rewardToken1)';
const event_reward_added = 'event RewardAdded(address indexed rewardToken, uint256 reward, uint256 startTimestamp)';

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, getToBlock, api } = options;

  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailyBribesRevenue = createBalances();

  // 1. Get options revenue from Option Exercise events (goes to Strategic Protocol Reserve/treasury)
  const exerciseLogs = await getLogs({
    target: OPTION_EXERCISE_CONTRACT,
    eventAbi: event_exercise,
  });

  exerciseLogs.forEach((log: any) => {
    dailyFees.add(ADDRESSES.base.USDC, log.paymentAmount);
    dailyProtocolRevenue.add(ADDRESSES.base.USDC, log.paymentAmount);
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

  // Query TYPE() on each bribe contract to determine if internal or external
  const bribeTypes = await api.multiCall({
    abi: 'function TYPE() view returns (string)',
    calls: bribeContracts,
  });

  // Map contracts to their types (external if contains "Bribe", otherwise internal)
  const isExternalBribe = new Map<string, boolean>();
  bribeContracts.forEach((contract, i) => {
    const typeStr = (bribeTypes[i] || '').toLowerCase();
    const isExternal = typeStr.includes('bribe');
    isExternalBribe.set(contract, isExternal);
  });

  // 3. Get all RewardAdded events from bribe contracts (DEX fees, Omni fees, and external bribes)
  // Fetch logs per contract to know which address emitted each event
  for (const contract of bribeContracts) {
    const isExternal = isExternalBribe.get(contract);

    const logs = await getLogs({
      target: contract,
      eventAbi: event_reward_added,
    });

    logs.forEach((log: any) => {
      dailyFees.add(log.rewardToken, log.reward);

      if (isExternal) {
        dailyBribesRevenue.add(log.rewardToken, log.reward);
      } else {
        dailyHoldersRevenue.add(log.rewardToken, log.reward);
      }
    });
  }

  const dailyRevenue = createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailyBribesRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  start: '2025-09-08',
  methodology: {
    Fees: "Total fees from DEX fees, option exercises, Omni Liquidity fees, and external bribes.",
    Revenue: "Protocol revenue from DEX fees (to holders), option exercises (to Strategic Protocol Reserve/treasury), and Omni Liquidity fees (to holders). External bribes are tracked separately in BribesRevenue.",
    ProtocolRevenue: "Revenue from option exercises allocated to the Strategic Protocol Reserve (treasury).",
    HoldersRevenue: "Protocol-generated revenue from DEX fees and Omni Liquidity fees distributed to governance token holders (excludes external bribes which are tracked in BribesRevenue).",
    BribesRevenue: "External bribes paid to governance token holders as incentives (tracked separately from protocol-generated HoldersRevenue).",
  }
};

export default adapter;
