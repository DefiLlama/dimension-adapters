import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import axios from "axios";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";


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
    let info = await  axios.get(`${historicalVolumeEndpoint}${path}`);
    const data  : IVolumeBridge[] = (info?.data)?.data.list;
    return data
}

const fetch = async (timestamp: number, block: any, options: FetchOptions) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const path = `/getOrderDayList?bridge=1&chain=${options.chain}&timestamp=${timestamp}`
    const data = await queryDataByApi(timestamp.toString(), path)
    let dailyVolume = data.find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume
    dailyVolume = dailyVolume || "0";
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
