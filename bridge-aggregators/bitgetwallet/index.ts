import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";


const CHAINS: Array<CHAIN> = [
    CHAIN.ETHEREUM,
    CHAIN.POLYGON,
    CHAIN.SOLANA,
    CHAIN.BSC,
    CHAIN.OPTIMISM,
    CHAIN.BASE,
    CHAIN.TON,
    CHAIN.TRON,
    CHAIN.BITCOIN,
    CHAIN.MANTA,
    CHAIN.LINEA,
    CHAIN.SUI,
    CHAIN.SCROLL,
    CHAIN.ARBITRUM,
    CHAIN.CORE,
    CHAIN.MERLIN,
    CHAIN.BLAST,
    CHAIN.APTOS
];




interface IVolumeBridge {
    volume: string;
    date: string;
}

async function queryDataByApi(timestamp:string, path:string){
    const historicalVolumeEndpoint = "https://new-swapopen.bitapi.vip/st";
    let info = await  httpGet(`${historicalVolumeEndpoint}${path}`);
    const data  : IVolumeBridge[] = (info)?.data.list;
    return data
}

const fetch = async (_t: number, _b: any, options: FetchOptions) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.startOfDay * 1000))
    const path = `/getOrderDayList?bridge=1&chain=${options.chain}&timestamp=${dayTimestamp}`
    const data = await queryDataByApi(dayTimestamp.toString(), path)
    const dateString = new Date(dayTimestamp * 1000).toISOString().split("T")[0];
    let dailyVolume = data.find(dayItem => dayItem.date === dateString)?.volume
    dailyVolume = dailyVolume || undefined;
    return {
        dailyBridgeVolume: dailyVolume,
        timestamp: options.endTimestamp,
    };
};

const adapter: any = {
    version: 1, // api supports other timestamps but if you try using current timestamps, it breaks, so sticking to v1 even though it should be able to support v2
    adapter:  {
        ...CHAINS.map(chain => {
            return {

                    [chain]: {
                        fetch: fetch,
                        start: '2024-01-01'
                    }

            }
        }).reduce((acc, item) => {
            return {
                ...acc,
                ...item
            }
        })
    },
};

export default adapter;
