import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../helpers/uniswap";

const VOTER = '0xe24c7CfAA1E81d7750b44c96E991Bdf760cbC06f';
const event_gauge_created = 'event GaugeCreated(address indexed gauge, address creator, address internal_bribe, address indexed external_bribe, address indexed pool)';
const event_reward_added = 'event RewardAdded(address indexed rewardToken, uint256 reward, uint256 startTimestamp)';
const TREASURY_FEE_RATIO = 0.1;

const v2Fetch = getUniV2LogAdapter({
  factory: '0x6DBb0b5B201d02aD74B137617658543ecf800170',
  stableFees: 0.0004,
});

const v3Fetch = getUniV3LogAdapter({
  factory: '0x2A6CE23C5017aF1b07B9c4E4014442aDE18Bd404',
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch: async (options: FetchOptions) => {
        const { createBalances, getLogs, getToBlock } = options;

        const [v2, v3] = await Promise.all([
          v2Fetch(options),
          v3Fetch(options),
        ]);

        const dailyFees = v2.dailyFees;
        if (v3.dailyFees) dailyFees.addBalances(v3.dailyFees);

        const dailyVolume = v2.dailyVolume;
        if (v3.dailyVolume) dailyVolume.addBalances(v3.dailyVolume);

        // Bribes (wrapped in try/catch - requires archive node access)
        const dailyBribes = createBalances();
        try {
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
        } catch (e) {
          console.error('Failed to fetch bribe data:', e);
        }

        return {
          dailyVolume,
          dailyFees,
          dailyUserFees: dailyFees,
          dailyRevenue: dailyFees,
          dailyProtocolRevenue: dailyFees.clone(TREASURY_FEE_RATIO),
          dailyHoldersRevenue: dailyFees.clone(1 - TREASURY_FEE_RATIO),
          dailyBribesRevenue: dailyBribes,
        };
      },
      start: '2026-02-11',
    },
  },
};

export default adapter;
