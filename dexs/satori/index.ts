import {postURL} from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const ZKEVM_URL = 'https://zksync.satori.finance/api/data-center/pub/overview/integration'
const ZkSYNC_URL = 'https://zksync.satori.finance/api/data-center/pub/overview/integration'
const SCROLL_URL = 'https://scroll.satori.finance/api/data-center/pub/overview/integration'
const LINEA_URL = 'https://linea.satori.finance/api/data-center/pub/overview/integration'

interface VolumeInfo {
    fee24h: string;
    tradVol24h: string;
    totalTradVol: string;
    totalUsers: string;
    time: string;
}
const zk_evm = {
    "exchange":"zk"
}

const zk_era = {
    "exchange":"zksync"
}
const scroll = {
    "exchange":"scroll"
}
const linea = {
    "exchange":"linea"
}
const evm_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(ZKEVM_URL,zk_evm)).data;
    
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue: volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const era_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(ZkSYNC_URL,zk_era)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const linea_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(ZkSYNC_URL,linea)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const scroll_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(ZkSYNC_URL,scroll)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};
const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.POLYGON_ZKEVM]: {
            fetch:evm_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.ERA]: {
            fetch:era_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.LINEA]: {
            fetch:linea_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.SCROLL]: {
            fetch:scroll_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        }
    },
};

export default adapter;
