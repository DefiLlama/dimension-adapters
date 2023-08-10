import {postURL} from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const ZKEVM_URL = 'https://zk.satori.finance/api/data-center/pub/analytics/integration'
const ZkSYNC_URL = 'https://zksync.satori.finance/api/data-center/pub/analytics/integration'
// const Test_URL = "https://satori-dev.citik.xyz/api/data-center/pub/analytics/integration"

interface VolumeInfo {
    fee24h: string;
    tradVol24h: string;
    totalTradVol: string;
    totalUsers: string;
    time: string;
}

const evm_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(ZKEVM_URL,'')).data.data;

    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const era_fetch  =  async (_timestamp: number) => {
    const volumeData: VolumeInfo = (await postURL(ZkSYNC_URL,'')).data.data;
   
    return {
            totalVolume: volumeData.totalTradVol,
            dailyVolume: volumeData.tradVol24h,
            dailyFees: volumeData.fee24h,
            timestamp: parseInt(volumeData.time),
        };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.POLYGON_ZKEVM]: {
            fetch:evm_fetch,
            runAtCurrTime: true,
            start: async () => 1684003134,
        },
        [CHAIN.ERA]: {
            fetch:era_fetch,
            runAtCurrTime: true,
            start: async () => 1684003134,
        }
    },
};

export default adapter;
