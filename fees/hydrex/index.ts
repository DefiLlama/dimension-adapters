import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { ethers } from "ethers";

const OPTION_EXERCISE_CONTRACT = '0xa1136031150e50b015b41f1ca6b2e99e49d8cb78';
const BRIBE_FACTORY = '0x58b4f302753003FFC1d70791775B93D0Edc87dC1';
// Hydrex's ProtocolReserveProxy (NAME() = 'ProtocolReserveProxy'), which holds the Strategic Protocol Reserve's USDC.
// Since 2026-09-22 Hydrex's Safe 0x704e305da17459880837bcd62c8e7644263eb476 has it fund bribe contracts with USDC every Tuesday,
// e.g. 0x583c260359beab498ce8a5b6031c2b43c4775272f65805c312cad2a5bbee36e8 (2026-11-10, 70,000 USDC to 25 bribe contracts).
const PROTOCOL_RESERVE = '0xfd1b334ca2b68b4ead59d5a309bab28f830b216e';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const event_exercise = 'event Exercise(address indexed sender, address indexed recipient, uint256 amount, uint256 paymentAmount)';
const event_create_bribe = 'event CreateBribe(address indexed bribe, string bribeType, address indexed rewardToken0, address indexed rewardToken1)';
const event_reward_added = 'event RewardAdded(address indexed rewardToken, uint256 reward, uint256 startTimestamp)';
const event_transfer = 'event Transfer(address indexed from, address indexed to, uint256 value)';

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, getToBlock, api } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  // 1. Get options revenue from Option Exercise events (goes to Strategic Protocol Reserve/treasury)
  const exerciseLogs = await getLogs({
    target: OPTION_EXERCISE_CONTRACT,
    eventAbi: event_exercise,
  });

  exerciseLogs.forEach((log: any) => {
    dailyFees.add(ADDRESSES.base.USDC, log.paymentAmount, 'Option Exercise Fees');
    dailyRevenue.add(ADDRESSES.base.USDC, log.paymentAmount, 'Option Exercise Fees');
    dailyProtocolRevenue.add(ADDRESSES.base.USDC, log.paymentAmount, 'Option Exercise Fees');
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

  // Transactions in which the protocol reserve pays out USDC: bribes in these transactions are funded by Hydrex itself
  const reserveTransfers = await getLogs({
    target: ADDRESSES.base.USDC,
    eventAbi: event_transfer,
    topics: [TRANSFER_TOPIC, ethers.zeroPadValue(PROTOCOL_RESERVE, 32)],
    onlyArgs: false,
  });
  const reserveFundedTxs = new Set<string>(reserveTransfers.map((log: any) => log.transactionHash.toLowerCase()));

  // 3. Get all RewardAdded events from bribe contracts (DEX fees, Omni fees, and external bribes)
  // Fetch logs per contract to know which address emitted each event
  for (const contract of bribeContracts) {
    const isExternal = isExternalBribe.get(contract);

    const logs = await getLogs({
      target: contract,
      eventAbi: event_reward_added,
      onlyArgs: false,
    });

    logs.forEach(({ args: log, transactionHash }: any) => {
      if (reserveFundedTxs.has(transactionHash.toLowerCase())) {
        // Paid out of the protocol's own reserve, not a fee: a distribution to voters, moved from protocol revenue to holders revenue
        dailyHoldersRevenue.add(log.rewardToken, log.reward, 'Protocol-Funded Voter Incentives');
        dailyProtocolRevenue.subtractToken(log.rewardToken, log.reward, 'Option Exercise Fees');
      } else if (isExternal) {
        dailyFees.add(log.rewardToken, log.reward, 'Bribes Rewards');
        dailyRevenue.add(log.rewardToken, log.reward, 'Bribes Revenue');
        dailyHoldersRevenue.add(log.rewardToken, log.reward, 'Bribes Revenue');
      } else {
        dailyFees.add(log.rewardToken, log.reward, 'DEX Fees');
        dailyRevenue.add(log.rewardToken, log.reward, 'DEX Fees');
        dailyHoldersRevenue.add(log.rewardToken, log.reward, 'DEX Fees To Holders');
      }
    });
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // ProtocolRevenue is negative in the hours the protocol reserve funds voter incentives
  allowNegativeValue: true,
  chains: [CHAIN.BASE],
  fetch,
  start: '2025-09-08',
  methodology: {
    Fees: "Total fees from DEX fees, option exercises, Omni Liquidity fees, and external bribes. Bribes Hydrex funds from its own Strategic Protocol Reserve are not fees.",
    Revenue: "Protocol revenue from DEX fees (to holders), option exercises (to Strategic Protocol Reserve/treasury), Omni Liquidity fees (to holders) and external bribes (to holders).",
    ProtocolRevenue: "Revenue from option exercises allocated to the Strategic Protocol Reserve (treasury), minus the USDC voter incentives Hydrex pays out of that reserve.",
    HoldersRevenue: "DEX fees, Omni Liquidity fees and external bribes distributed to governance token holders, plus the USDC voter incentives Hydrex pays them out of its Strategic Protocol Reserve.",
  },
  breakdownMethodology: {
    Fees: {
      'DEX Fees': 'Total fees from DEX fees',
      'Option Exercise Fees': 'Total fees from option exercises',
      'Bribes Rewards': 'External bribes paid to governance token holders as incentives (excludes bribes Hydrex funds from its own reserve)',
    },
    Revenue: {
      'DEX Fees': 'Share of fees from DEX fees to holders',
      'Option Exercise Fees': 'Revenue from option exercises allocated to the Strategic Protocol Reserve (treasury).',
      'Bribes Revenue': 'External bribes paid to governance token holders as incentives (excludes bribes Hydrex funds from its own reserve)',
    },
    HoldersRevenue: {
      'DEX Fees To Holders': 'Share of fees from DEX fees to holders',
      'Bribes Revenue': 'External bribes paid to governance token holders as incentives (excludes bribes Hydrex funds from its own reserve)',
      'Protocol-Funded Voter Incentives': 'USDC that Hydrex pays from its Strategic Protocol Reserve into bribe contracts for voters (weekly since 2026-09-22); not a fee, moved from ProtocolRevenue',
    },
    ProtocolRevenue: {
      'Option Exercise Fees': 'Revenue from option exercises allocated to the Strategic Protocol Reserve (treasury), minus the voter incentives Hydrex pays out of that reserve.',
    },
  }
};

export default adapter;
