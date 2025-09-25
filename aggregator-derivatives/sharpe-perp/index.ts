import fetchURL from "../../utils/fetchURL";
import { FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: any): Promise<FetchResultV2> => {
    const dailyData:any = await fetchURL('https://base-api.sharpe.ai/api/dailySharpePerpVolume')  
    return {
        dailyVolume: dailyData?.dailyVolume
    };
};

// CHAIN.ARBITRUM, CHAIN.MANTLE, CHAIN.OPTIMISM, CHAIN.BASE, 
export default {
    version: 2,
    deadFrom: '2025-05-03',
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2024-04-01'
        },
    },
}
