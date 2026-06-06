import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";
import { fees_bribes } from './bribes';
import { METRIC } from "../../helpers/metrics";
import { breakdownMethodology, createPoolFetchHandler, methodology } from "../../dexs/ramses-hl-cl";


const FACTORY_ADDRESS = '0xaaa20d08e59f6561f242b08513d36266c5a29415';

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.ARBITRUM]: 1678838400,
}
const arbitrumCutover = Date.UTC(2026, 0, 28) / 1000;
const currentFetch = createPoolFetchHandler('legacy');
const fetchCurrent = (options: FetchOptions) => currentFetch(undefined, undefined, options);

const getBribes = async ({ fromTimestamp, toTimestamp, createBalances, getFromBlock, }: FetchOptions): Promise<any> => {
  const fromBlock = await getFromBlock()
  const bribes = createBalances();
  const bribes_delta = createBalances();
  await fees_bribes(fromBlock, toTimestamp, bribes_delta);
  await fees_bribes(fromBlock, fromTimestamp, bribes);
  bribes.subtract(bribes_delta);
  return {
    timestamp: toTimestamp,
    dailyBribesRevenue: bribes,
  };
};

const feeAdapter = uniV2Exports({
  [CHAIN.ARBITRUM]: { factory: FACTORY_ADDRESS, },
}).adapter![CHAIN.ARBITRUM].fetch


const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async (options: FetchOptions) => {
        if (options.startOfDay >= arbitrumCutover) return fetchCurrent(options);

        const v1Results: any = await feeAdapter!(options as any, {}, options)
        const bribesResult = await getBribes(options);
        const dailyFees = options.createBalances();
        const dailyUserFees = options.createBalances();
        const dailyProtocolRevenue = options.createBalances();
        const dailySupplySideRevenue = options.createBalances();
        const dailyHoldersRevenue = options.createBalances();

        const bribeRevenue = Number(await bribesResult.dailyBribesRevenue.getUSDValue());
        const swapFees = Number(await v1Results.dailyFees.getUSDValue());

        dailyFees.addUSDValue(swapFees, METRIC.SWAP_FEES);
        dailyUserFees.addUSDValue(swapFees, METRIC.SWAP_FEES);
        dailyFees.addUSDValue(bribeRevenue, 'Bribes');

        dailyHoldersRevenue.addUSDValue(swapFees * 0.75, 'Swap Fees to holders');
        dailyProtocolRevenue.addUSDValue(swapFees * 0.05, 'Swap Fees to protocol');
        dailySupplySideRevenue.addUSDValue(swapFees * 0.20, 'Swap Fees to LPs');

        dailyHoldersRevenue.addUSDValue(bribeRevenue, 'Bribes to holders');

        const dailyRevenue = dailyHoldersRevenue.clone();
        dailyRevenue.add(dailyProtocolRevenue);

        return {
          dailyVolume: v1Results.dailyVolume,
          dailyFees,
          dailyUserFees,
          dailyRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
          dailyHoldersRevenue,
        };
      },
      start: startTimeV2[CHAIN.ARBITRUM],
    },
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchCurrent,
      start: '2025-11-08',
    },
    [CHAIN.POLYGON]: {
      fetch: fetchCurrent,
      start: '2026-01-28',
    },
  },
};

export default adapter;
