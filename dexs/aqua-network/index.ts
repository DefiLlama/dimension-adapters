import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const AQUA_VOLUME_ENDPOINT = "https://amm-api.aqua.network/api/external/v1/statistics/totals/?size=all"

interface IVolumeAll {
  volume: number;
  tvl: number;
  date: string;
  protocol_fees: number;
  lp_fees: number;
  external_rewards: number;
  timestamp_date_from: number;
  timestamp_date_to: number;
}

let historicalVolume: IVolumeAll[] | any

const fetch = async ({ startOfDay, dateString, createBalances }: FetchOptions) => {
  if (!historicalVolume) historicalVolume = fetchURL(AQUA_VOLUME_ENDPOINT)
  historicalVolume = await historicalVolume

  // Seems like we have here gap about 3.5 hours in to-timestamps, can u maybe explain that diff? 
  // Finding day period from our api, that matches llama toTimestamp (current time)
  const day = historicalVolume.find((i: any) => startOfDay === i.timestamp_date_from);

  if (!day) throw new Error('No data for timestamp: ' + dateString);
  
  const ProtocolFees = day.protocol_fees / 1e7
  const LPFees = day.lp_fees / 1e7
  const ExternalRewards = day.external_rewards / 1e7

  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  dailyFees.addUSDValue(ProtocolFees + LPFees, 'Token Swap Fees');
  dailyFees.addUSDValue(ExternalRewards, 'External Bribes Rewards');

  dailyRevenue.addUSDValue(ProtocolFees, 'Token Swap Fees To Holders');
  dailyRevenue.addUSDValue(ExternalRewards, 'External Bribes Revenue');

  dailySupplySideRevenue.addUSDValue(LPFees, 'Token Swap Fees To LPs');
  
  return {
    dailyVolume: day.volume / 1e7,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailyProtocolRevenue: 0,
  }
};

const methodology = {
  Fees: "All fees including 100% of the swap fees and external rewards for AQUA holders.",
  UserFees: "100% of the swap fees",
  Revenue: "50% of the swap fees that are received by the protocol and then distributed between AQUA holders that voted for the markets where these fees have been collected",
  ProtocolRevenue: "Share of the fees kept by Aquarius. Currently equals 0.",
  HoldersRevenue: "50% of the swap fees that are received by the protocol and then distributed between AQUA holders that voted for the markets where these fees have been collected.",
  SupplySideRevenue: "50% of the swap fees that are shared with the Aquarius liquidity providers",
}

const breakdownMethodology = {
  Fees: {
    'Token Swap Fees': 'All fees including 100% of the swap fees',
    'External Bribes Rewards': 'External bribes rewards distributed to AQUA holders',
  },
  Revenue: {
    'Token Swap Fees To Holders': 'Amount of swap fees are shared to AQUA holders',
    'External Bribes Revenue': 'External bribes rewards distributed to AQUA holders',
  },
  SupplySideRevenue: {
    'Token Swap Fees To LPs': 'Amount of swap fees are distributed to LPs',
  },
  HoldersRevenue: {
    'Token Swap Fees To Holders': 'Amount of swap fees are shared to AQUA holders',
    'External Bribes Revenue': 'External bribes rewards distributed to AQUA holders',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.STELLAR]: { fetch, start: '2024-08-25' },
  },
};

export default adapter;
