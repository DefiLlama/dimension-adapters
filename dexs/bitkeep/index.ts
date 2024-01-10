import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
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
        const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + `?chain=${chain}`))?.data.data.list;

        const totalVolume = historicalVolume
            .filter(volItem => (new Date(volItem.date).getTime() / 1000) <= dayTimestamp)
            .reduce((acc, { volume }) => acc + Number(volume), 0)

        const dailyVolume = historicalVolume
            .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume

        return {
            totalVolume: `${totalVolume}`,
            dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
            timestamp: dayTimestamp,
        };
    }
}


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: graph(CHAIN.ETHEREUM),
            start: async () => 1667232000,
        },
        [CHAIN.POLYGON]: {
            fetch: graph(CHAIN.POLYGON),
            start: async () => 1667232000,
        },
        [CHAIN.BSC]: {
            fetch: graph(CHAIN.BSC),
            start: async () => 1667232000,
        },
        [CHAIN.HECO]: {
            fetch: graph(CHAIN.HECO),
            start: async () => 1667232000,
        },
        [CHAIN.FANTOM]: {
            fetch: graph(CHAIN.FANTOM),
            start: async () => 1667232000,
        },
        [CHAIN.ARBITRUM]: {
            fetch: graph(CHAIN.ARBITRUM),
            start: async () => 1667232000,
        },
        [CHAIN.OPTIMISM]: {
            fetch: graph(CHAIN.OPTIMISM),
            start: async () => 1667232000,
        },
    }
};

export default adapter;
