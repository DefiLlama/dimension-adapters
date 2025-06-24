import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";


const historicalVolumeEndpoint = "https://new-swapopen.bitapi.vip/st/getOrderDayList"

interface IVolumeall {
    volume: string;
    date: string;
}

const graph = (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultVolume> => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
        const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + `?chain=${chain}`))?.data.list;

        const dailyVolume = historicalVolume
            .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume

        return {
            dailyVolume: dailyVolume,
        };
    }
}


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: graph(CHAIN.ETHEREUM),
            start: '2022-10-31',
        },
        [CHAIN.BSC]: {
            fetch: graph(CHAIN.BSC),
            start: '2022-10-31',
        },
        [CHAIN.ARBITRUM]: {
            fetch: graph(CHAIN.ARBITRUM),
            start: '2022-10-31',
        },
        [CHAIN.OPTIMISM]: {
            fetch: graph(CHAIN.OPTIMISM),
            start: '2022-10-31',
        },
    }
};

export default adapter;
