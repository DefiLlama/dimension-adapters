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

  const dailyProtocolRevenue = dailyFees.clone(TREASURY_FEE_RATIO);
  const dailyHoldersRevenue = dailyFees.clone(1 - TREASURY_FEE_RATIO);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailyBribesRevenue: dailyBribes,
  } as any;
};

export default uniV2Exports({
  [CHAIN.MONAD]: {
    factory: '0x6DBb0b5B201d02aD74B137617658543ecf800170',
    start: '2026-02-11',
    stableFees: 0.0004,
    customLogic,
  },
})
