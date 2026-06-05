import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://new-swapopen.bitapi.vip/st/getOrderDayList"

interface IVolumeall {
    volume: string;
    date: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.toTimestamp * 1000))
    const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + `?chain=${options.chain}`))?.data.list;

    const dailyVolume = historicalVolume
        .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume

    return {
        dailyVolume: dailyVolume,
    };
}


const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.ARBITRUM, CHAIN.OPTIMISM],
    start: '2022-10-31',
};

export default adapter;
