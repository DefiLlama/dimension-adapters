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

  // External rewards (bribes) are voting incentives that accrue to AQUA holders
  // alongside the swap-fee share, but they are passthrough incentives — included
  // in dailyHoldersRevenue and excluded from dailyRevenue, mirroring the
  // migration done for shadow / ocelex / lithos.
  return {
    dailyVolume: day.volume / 1e7,
    dailyFees: ProtocolFees + LPFees,
    dailyUserFees: ProtocolFees + LPFees,
    dailySupplySideRevenue: LPFees,
    dailyRevenue: ProtocolFees,
    dailyHoldersRevenue: ProtocolFees + ExternalRewards,
    dailyProtocolRevenue: 0,
  }
};

const methodology = {
  Fees: "100% of the swap fees on Aquarius.",
  UserFees: "100% of the swap fees.",
  Revenue: "50% of the swap fees distributed between AQUA holders that voted for the markets where these fees have been collected. External voting incentives are passthrough and excluded.",
  ProtocolRevenue: "Share of the fees kept by Aquarius. Currently equals 0.",
  HoldersRevenue: "50% of the swap fees distributed between AQUA holders that voted for the markets where these fees have been collected, plus external voting incentives routed to those same holders.",
  SupplySideRevenue: "50% of the swap fees that are shared with the Aquarius liquidity providers.",
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.STELLAR]: { fetch, start: '2024-07-01' },
  },
};

export default adapter;
