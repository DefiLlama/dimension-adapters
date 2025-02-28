import {postURL} from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const DATA_URL = 'https://trade.satori.finance/api/data-center/pub/overview/integration'
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
const  base = {
    "exchange":"base"
}
const arbitrum = {
    "exchange":"arbitrum-one"
}
const xlayer = {
    "exchange":"xlayer"
}
const plume = {
    "exchange":"plume"
}
const zircuit = {
    "exchange":"zircuit"
}
const story = {
    "exchange":"story"
}
const ethereum = {
    "exchange":"ethereum"
}
const bsc = {
    "exchange":"bsc"
}
const optimism = {
    "exchange":"optimism"
}
const ton = {
    "exchange":"ton"
}

const evm_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,zk_evm)).data;
    
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue: volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const era_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,zk_era)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const linea_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,linea)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const scroll_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,scroll)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const base_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,base)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const arbitrum_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,arbitrum)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const plume_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,plume)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const zircuit_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,zircuit)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const story_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,story)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};
const ethereum_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,ethereum)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};
const bsc_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,bsc)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};
const xlayer_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,xlayer)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};
const ton_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,ton)).data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            dailyRevenue : volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};
const optimism_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(DATA_URL,optimism)).data;
   
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
        },
        [CHAIN.BASE]: {
            fetch:base_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.ARBITRUM]: {
            fetch:arbitrum_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.XLAYER]: {
            fetch:xlayer_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.PLUME]: {
            fetch:plume_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.ZIRCUIT]: {
            fetch:zircuit_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.STORY]: {
            fetch:story_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.ETHEREUM]: {
            fetch:ethereum_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.BSC]: {
            fetch:bsc_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.OPTIMISM]: {
            fetch:optimism_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        },
        [CHAIN.TON]: {
            fetch:ton_fetch,
            runAtCurrTime: true,
            start: 1684003134,
        }
    },
};

export default adapter;
