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

const fetch = async (_: any, _1: any, { startOfDay, dateString, }: FetchOptions) => {
  if (!historicalVolume)
    historicalVolume = fetchURL(AQUA_VOLUME_ENDPOINT)
  historicalVolume = await historicalVolume

  // Seems like we have here gap about 3.5 hours in to-timestamps, can u maybe explain that diff? 
  // Finding day period from our api, that matches llama toTimestamp (current time)
  const day = historicalVolume
    .find(i => startOfDay === i.timestamp_date_from);

  if (!day)
    throw new Error('No data for timestamp: ' + dateString);


  const ProtocolFees = day.protocol_fees / 1e7
  const LPFees = day.lp_fees / 1e7
  const ExternalRewards = day.external_rewards / 1e7

  return {
    dailyVolume: day.volume / 1e7,
    dailyFees: ProtocolFees + LPFees,
    dailyUserFees: ProtocolFees + LPFees,
    dailySupplySideRevenue: LPFees,
    dailyRevenue: ProtocolFees,
    dailyHoldersRevenue: ProtocolFees,
    dailyBribesRevenue: ExternalRewards,
    dailyProtocolRevenue: 0,
  }
};

const methodology = {
  dailyFees: "All fees including 100% of the swap fees and external rewards for AQUA holders.",
  dailyUserFees: "100% of the swap fees",
  dailyRevenue: "50% of the swap fees that are received by the protocol and then distributed between AQUA holders that voted for the markets where these fees have been collected",
  dailyProtocolRevenue: "Share of the fees kept by Aquarius. Currently equals 0.",
  dailyHoldersRevenue: "50% of the swap fees that are received by the protocol and then distributed between AQUA holders that voted for the markets where these fees have been collected.",
  dailySupplySideRevenue: "50% of the swap fees that are shared with the Aquarius liquidity providers",
  dailyBribesRevenue: "Amount of external incentives for AQUA holders voting for specific markets on Aquarius.",
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.STELLAR]: { fetch, start: '2024-07-01' },
  },
};

export default adapter;
