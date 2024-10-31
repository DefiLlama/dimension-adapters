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
        const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + `?chain=${chain}`))?.data.list;

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

const CHAINS: Array<CHAIN> = [
    CHAIN.ETHEREUM,
    CHAIN.POLYGON,
    CHAIN.SOLANA,
    CHAIN.BSC,
    CHAIN.OPTIMISM,
    CHAIN.BASE,
    CHAIN.TON,
    CHAIN.TRON,
    CHAIN.BITCOIN
];



const adapter: SimpleAdapter = {
    adapter: {
        ...CHAINS.map(chain => {
            return {
                
                    [chain]: {
                        fetch: graph(chain),
                        start: 1667232000
                    }
                
            }
        }).reduce((acc, item) => {
            return {
                ...acc,
                ...item
            }
        })
    }
};

export default adapter;
