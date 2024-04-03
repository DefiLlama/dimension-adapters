import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  getVeloGaugeDetails,
  getAeroGaugeDetails
} from "./helpers";
import { getFees } from "../../helpers/compoundV2";

const unitrollerOP = "0x60CF091cD3f50420d50fD7f707414d0DF4751C58";
const unitrollerBASE = "0x1DB2466d9F5e10D7090E7152B68d62703a2245F0";
const veloGauge = "0x62D9e4e99482aF8D573d5ce1ed527C96783153ad";
const aeroGauge = "0xCbfeaED3dd9310406c046FB496C7E77f7571a808";
const veloToken = "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db";
const aeroToken = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const veVeloHolder = "0x784b82a27029c9e114b521abcc39d02b3d1deaf2";
const veAeroHolder = "0x814ae3e7Bc6B20b4Da64b76A7E66BCa0993F22A8";

const methodology = {
  Fees: "Fees are calculated from borrowers' interest payments, which are determined by the Annual Percentage Yield (APY) associated with the borrowed asset.",
  Revenue: "Revenue is derived as a percentage of collected fees, determined by the reserve factor associated with each asset.",  
  HoldersRevenue: "All revenue and VELO/AERO LP rewards are allocated entirely to $SONNE stakers.",
}

const getDailyVeloRewards = async ({ api, fromTimestamp, toTimestamp, createBalances }: FetchOptions) => {
  const balances = createBalances();
  const { earned} = await getVeloGaugeDetails(veloGauge, veloToken, veVeloHolder, api,);

  // const timespan = toTimestamp - fromTimestamp;
  // const earnedTimespan = toTimestamp - lastEarn;
  // const ratio = timespan / earnedTimespan;
  balances.add(veloToken, earned/7); // TODO: Add more accurate dailyrewards based on timestamp
  return balances
};

const getDailyAeroRewards = async ({ api, fromTimestamp, toTimestamp, createBalances }: FetchOptions) => {
  const balances = createBalances();
  const { earned} = await getAeroGaugeDetails(aeroGauge, aeroToken, veAeroHolder, api,);

  // const timespan = toTimestamp - fromTimestamp;
  // const earnedTimespan = toTimestamp - lastEarn;
  // const ratio = timespan / earnedTimespan;
  balances.add(aeroToken, earned/7); // TODO: Add more accurate dailyrewards based on timestamp
  return balances
};


const fetchoptimism = async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const { dailyFees, dailyRevenue } = await getFees(unitrollerOP, options, {});
  const dailyHoldersRevenue = await getDailyVeloRewards(options);
  dailyHoldersRevenue.addBalances(dailyRevenue);

  return { timestamp, dailyFees, dailyRevenue, dailyHoldersRevenue };
};

const fetchbase = async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const { dailyFees, dailyRevenue } = await getFees(unitrollerBASE, options, {});
  const dailyHoldersRevenue = await getDailyAeroRewards(options);
  dailyHoldersRevenue.addBalances(dailyRevenue);

  return { timestamp, dailyFees, dailyRevenue, dailyHoldersRevenue };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchoptimism as any,
      start: 1664582400, // TODO: Sort out how to backfill data?graphs
      meta: { methodology },
    },
    [CHAIN.BASE]: {
      fetch: fetchbase as any,
      start: 1693449471, // TODO: Sort out how to backfill data?graphs
      meta: { methodology },
    },
  },
};


export default adapter;
