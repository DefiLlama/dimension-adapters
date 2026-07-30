import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";
import { METRIC } from "../../helpers/metrics";


const FACTORY_ADDRESS = '0xaaa20d08e59f6561f242b08513d36266c5a29415';
const FIRST_SWAP_ONLY_DAY_TIMESTAMP = 1776816000; // 2026-04-22T00:00:00Z

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.ARBITRUM]: 1678838400,
}

const methodology = {
  UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  ProtocolRevenue: "5% of swap fees go to the protocol.",
  HoldersRevenue: "75% of swap fees go to holders.",
  SupplySideRevenue: "20% of swap fees go to LPs.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by users",
  },
  Revenue: {
    ['Swap Fees to protocol']: "5% of swap fees go to the protocol treasury",
    ['Swap Fees to holders']: "75% of swap fees go to the holders",
  },
  ProtocolRevenue: {
    ['Swap Fees to protocol']: "5% of swap fees go to the protocol treasury",
  },
  SupplySideRevenue: {
    ['Swap Fees to LPs']: "20% of swap fees go to the LPs",
  },
  HoldersRevenue: {
    ['Swap Fees to holders']: "75% of swap fees go to the holders",
  },
}


const feeAdapter = uniV2Exports({
  [CHAIN.ARBITRUM]: { factory: FACTORY_ADDRESS, },
}).adapter![CHAIN.ARBITRUM].fetch


const adapter: Adapter = {
  version: 2,
  // UniV2 log block ranges are inclusive; adjacent hourly slices can overlap.
  pullHourly: false,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async (options: FetchOptions) => {
        if (options.startOfDay < FIRST_SWAP_ONLY_DAY_TIMESTAMP)
          throw new Error('Historical RAMSES v1 fees included bribes from a retired source and cannot be safely recomputed.');

        const v1Results: any = await feeAdapter!(options as any, {}, options)

        const dailyFees = options.createBalances();
        const dailyProtocolRevenue = options.createBalances();
        const dailySupplySideRevenue = options.createBalances();
        const dailyHoldersRevenue = options.createBalances();

        const swapFees = Number(await v1Results.dailyFees.getUSDValue());

        dailyFees.addUSDValue(swapFees, METRIC.SWAP_FEES);

        dailyHoldersRevenue.addUSDValue(swapFees * 0.75, 'Swap Fees to holders');
        dailyProtocolRevenue.addUSDValue(swapFees * 0.05, 'Swap Fees to protocol');
        dailySupplySideRevenue.addUSDValue(swapFees * 0.20, 'Swap Fees to LPs');

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
