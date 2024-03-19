import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  getVeloGaugeDetails,
} from "./helpers";
import { getFees } from "../../helpers/compoundV2";

const unitroller = "0x60CF091cD3f50420d50fD7f707414d0DF4751C58";
const veloGauge = "0x3786d4419d6b4a902607ceb2bb319bb336735df8";
const veloToken = "0x3c8b650257cfb5f272f799f5e2b4e65093a11a05";
const veVeloHolder = "0x17063ad4e83b0aba4ca0f3fc3a9794e807a00ed7";

const getDailyVeloRewards = async ({ api, fromTimestamp, toTimestamp, createBalances }: FetchOptions) => {
  const balances = createBalances();
  const { lastEarn, earned } = await getVeloGaugeDetails(veloGauge, veloToken, veVeloHolder, api,);

  const timespan = toTimestamp - fromTimestamp;
  const earnedTimespan = toTimestamp - lastEarn;
  const ratio = timespan / earnedTimespan;
  balances.add(veloToken, earned * ratio);
  return balances
};

const fetch = async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const { dailyFees, dailyRevenue } = await getFees(unitroller, options, {});
  const dailyHoldersRevenue = await getDailyVeloRewards(options)
  dailyHoldersRevenue.addBalances(dailyRevenue)

  return { timestamp, dailyFees, dailyRevenue, dailyHoldersRevenue, };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch as any,
      start: 1664582400,
    },
  },
};

export default adapter;
