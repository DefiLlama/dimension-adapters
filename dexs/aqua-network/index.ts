import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const AQUA_VOLUME_ENDPOINT = "https://amm-api.aqua.network/api/external/v1/statistics/totals/?size=all"

interface IVolumeAll {
    volume: number;
    tvl: number;
    date: string;
}

const fetch = async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historicalVolume: IVolumeAll[] = (await fetchURL(AQUA_VOLUME_ENDPOINT));

    const dailyVolume = historicalVolume
        .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume
    
    return {
        dailyVolume: dailyVolume ? `${Number(dailyVolume) / 1e7}` : undefined,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.STELLAR]: {
            fetch,
            start: '2024-07-01',
        },
    },
};

export default adapter;
