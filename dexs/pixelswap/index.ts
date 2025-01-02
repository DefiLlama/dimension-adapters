import postURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const endpoint = "https://api.pixelswap.io/apis/pairs/tokens/volume?"


const fetch = async (options: FetchOptions) => {
    const startTime = new Date(options.startTimestamp * 1000).toISOString().split(".")[0]
    const endTime = new Date(options.endTimestamp * 1000).toISOString().split(".")[0]
    const res = await postURL(`${endpoint}since=${startTime}&until=${endTime}`)

    const swapVolume = res.data.pairs;
    const depositWithdraw = res.data.tokens;
    let dailyVolumeResult = 0;

    swapVolume.forEach(pair => {
        if (pair.volumeInRange != 0) { 
            dailyVolumeResult += Number(pair.volumeInRange / (Math.pow(10, Number(pair.pairDetails.token1.decimals))) * pair.pairDetails.token1.usdPrice);
        }
    })
    depositWithdraw.forEach(token => {
        if (token.volumeInRange != 0) { 
            dailyVolumeResult += Number(token.volumeInRange / (Math.pow(10, Number(token.decimals))) * token.usdPrice);
        }
    })
    return {
        dailyVolume: dailyVolumeResult,
        timestamp: options.startTimestamp,
    };
};


const adapter: any = {
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            fetch,
            start: '2024-09-11',
        },
    },
};

export default adapter;