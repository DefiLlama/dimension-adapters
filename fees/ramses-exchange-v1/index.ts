import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";
import { fees_bribes } from './bribes';
import { METRIC } from "../../helpers/metrics";


const FACTORY_ADDRESS = '0xaaa20d08e59f6561f242b08513d36266c5a29415';

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.ARBITRUM]: 1678838400,
}

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

const methodology = {
  UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  ProtocolRevenue: "Revenue going to the protocol. 5% of collected fees. (is probably right because the distribution is dynamic.)",
  HoldersRevenue: "User fees are distributed among holders. 75% of collected fees. (is probably right because the distribution is dynamic.)",
  SupplySideRevenue: "20% of collected fees are distributed among LPs. (is probably right because the distribution is dynamic.)"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by users",
    ['Bribes']: "Bribes paid by protocols"
  },
  Revenue: {
    ['Swap Fees to protocol']: "5% of swap fees go to the protocol treasury",
    ['Swap Fees to holders']: "75% of swap fees go to the holders",
    ['Bribes to holders']: "All the bribes go to the holders",
  },
  ProtocolRevenue: {
    ['Swap Fees to protocol']: "5% of swap fees go to the protocol treasury",
  },
  SupplySideRevenue: {
    ['Swap Fees to LPs']: "20% of swap fees go to the LPs",
  },
  HoldersRevenue: {
    ['Swap Fees to holders']: "75% of swap fees go to the holders",
    ['Bribes to holders']: "All the bribes go to the holders",
  },
}


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
        const v1Results: any = await feeAdapter!(options as any, {}, options)
        const bribesResult = await getBribes(options);
        v1Results.dailyBribesRevenue = bribesResult.dailyBribesRevenue;

        const dailyFees = options.createBalances();
        const dailyProtocolRevenue = options.createBalances();
        const dailySupplySideRevenue = options.createBalances();
        const dailyHoldersRevenue = options.createBalances();

        const bribeRevenue = Number(await bribesResult.dailyBribesRevenue.getUSDValue());
        const swapFees = Number(await v1Results.dailyFees.getUSDValue());

        dailyFees.addUSDValue(swapFees, METRIC.SWAP_FEES);
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
          dailyUserFees: dailyFees,
          dailyRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
          dailyHoldersRevenue,
        };
      },
      start: startTimeV2[CHAIN.ARBITRUM],
    },
  },
};

export default adapter;
