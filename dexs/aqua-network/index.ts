import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const AQUA_VOLUME_ENDPOINT = "https://amm-api.aqua.network/api/external/v1/statistics/totals/?size=all"

interface IVolumeAll {
    volume: number;
    tvl: number;
    date: string;
    protocol_fees: number;
    lp_fees: number;
    external_rewards: number;
}

const fetch = async ({ fromTimestamp, toTimestamp }:FetchOptions) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(fromTimestamp * 1000))
    const historicalVolume: IVolumeAll[] = (await fetchURL(AQUA_VOLUME_ENDPOINT));

    const day = historicalVolume
        .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)

    const DailyVolume = Number(day?.volume) / 1e7;
    const ProtocolFees = Number(day?.protocol_fees) / 1e7;
    const LPFees = Number(day?.lp_fees) / 1e7;
    const ExternalRewards = Number(day?.external_rewards) / 1e7;

    return day ? {
        dailyVolume: DailyVolume,
        dailyFees: ProtocolFees + LPFees + ExternalRewards,
        dailyRevenue: LPFees + ExternalRewards,
        dailyProtocolRevenue: 0,
    } : {
        dailyVolume: 0,
        dailyFees: 0,
            dailyRevenue: 0,
        dailyProtocolRevenue: 0
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
    [CHAIN.STELLAR]: { fetch, start: '2024-07-01' },
  },
};

export default adapter;
