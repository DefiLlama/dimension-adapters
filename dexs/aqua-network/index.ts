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
}

const fetch = async (_: any, _1: any, { dateString, }: FetchOptions) => {
  const historicalVolume: IVolumeAll[] = (await fetchURL(AQUA_VOLUME_ENDPOINT));

  const day = historicalVolume
    .find(i => i.date === dateString)
  if (!day) throw new Error('No data for timestamp: ' + dateString);

  const ProtocolFees = day.protocol_fees / 1e7
  const LPFees = day.lp_fees / 1e7
  const ExternalRewards = day.external_rewards / 1e7

  return {
    dailyVolume: day.volume / 1e7,
    dailyFees: ProtocolFees + LPFees + ExternalRewards,
    dailySupplySideRevenue: LPFees,
    dailyRevenue: LPFees + ExternalRewards,
    dailyHoldersRevenue: LPFees + ExternalRewards,
    dailyProtocolRevenue: 0,
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STELLAR]: { fetch, start: '2024-07-01' },
  },
};

export default adapter;
