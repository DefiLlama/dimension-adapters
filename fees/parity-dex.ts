import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";

const VOTER = '0xe24c7CfAA1E81d7750b44c96E991Bdf760cbC06f';
const event_gauge_created = 'event GaugeCreated(address indexed gauge, address creator, address internal_bribe, address indexed external_bribe, address indexed pool)';
const event_reward_added = 'event RewardAdded(address indexed rewardToken, uint256 reward, uint256 startTimestamp)';
const TREASURY_FEE_RATIO = 0.1;

const customLogic = async ({ dailyFees, fetchOptions }: any) => {
  const { createBalances, getLogs, getToBlock } = fetchOptions;
  const dailyBribes = createBalances();

  const gaugeCreatedLogs = await getLogs({
    target: VOTER,
    fromBlock: 54650084,
    toBlock: await getToBlock(),
    eventAbi: event_gauge_created,
    onlyArgs: true,
    cacheInCloud: true,
  });

  const externalBribes = gaugeCreatedLogs
    .map((log: any) => log.external_bribe)
    .filter((addr: string) => addr !== '0x0000000000000000000000000000000000000000');

  if (externalBribes.length > 0) {
    const bribeLogs = await getLogs({
      targets: externalBribes,
      eventAbi: event_reward_added,
      flatten: true,
    });

    for (const log of bribeLogs) {
      dailyBribes.add(log.rewardToken, log.reward);
    }
  }

  const totalFees = createBalances()
  const totalUserFees = createBalances()
  const totalRevenue = createBalances()
  const totalProtocolRevenue = createBalances()
  const totalHoldersRevenue = createBalances()
  
  totalFees.add(dailyFees, 'Token Swap Fees')
  totalFees.add(dailyBribes, 'Bribes Rewards')

  totalUserFees.add(dailyFees, 'Token Swap Fees')

  totalRevenue.add(dailyFees.clone(TREASURY_FEE_RATIO), 'Token Swap Fees To Protocol')
  totalRevenue.add(dailyFees.clone(1 - TREASURY_FEE_RATIO), 'Token Swap Fees To Holders')
  totalRevenue.add(dailyBribes, 'Bribes Revenue')

  totalHoldersRevenue.add(dailyFees.clone(1 - TREASURY_FEE_RATIO), 'Token Swap Fees To Holders')
  totalHoldersRevenue.add(dailyBribes, 'Bribes Revenue')
  
  totalProtocolRevenue.add(dailyFees.clone(TREASURY_FEE_RATIO), 'Token Swap Fees To Protocol')
  
  return {
    dailyFees: totalFees,
    dailyUserFees: totalUserFees,
    dailyRevenue: totalRevenue,
    dailyProtocolRevenue: totalProtocolRevenue,
    dailyHoldersRevenue: totalHoldersRevenue,
  } as any;
};

const methodology = {
  Fees: "Swap fees paid by users plus bribes rewards deposited for Parity voters.",
  UserFees: "Swap fees paid by users.",
  Revenue: "Protocol share of swap fees, holder share of swap fees, and bribes revenue distributed to holders.",
  ProtocolRevenue: "Treasury share of swap fees.",
  HoldersRevenue: "Holder share of swap fees plus bribes revenue distributed to holders.",
};

const breakdownMethodology = {
  Fees: {
    'Token Swap Fees': 'Swap fees paid by users on Parity pools.',
    'Bribes Rewards': 'External bribes deposited for Parity voters.',
  },
  UserFees: {
    'Token Swap Fees': 'Swap fees paid by users on Parity pools.',
  },
  Revenue: {
    'Token Swap Fees To Protocol': 'Treasury share of swap fees.',
    'Token Swap Fees To Holders': 'Holder share of swap fees.',
    'Bribes Revenue': 'External bribes distributed to holders.',
  },
  ProtocolRevenue: {
    'Token Swap Fees To Protocol': 'Treasury share of swap fees.',
  },
  HoldersRevenue: {
    'Token Swap Fees To Holders': 'Holder share of swap fees.',
    'Bribes Revenue': 'External bribes distributed to holders.',
  },
};

export default {
  ...uniV2Exports({
    [CHAIN.MONAD]: {
      factory: '0x6DBb0b5B201d02aD74B137617658543ecf800170',
      start: '2026-02-11',
      stableFees: 0.0004,
      customLogic,
    },
  }),
  methodology,
  breakdownMethodology,
}
