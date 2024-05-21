import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

interface ISnsyResponse {
    daily_volume: string;
    daily_volume_premium: string;
    total_volume: string;
    total_volume_premium: string;
}

const getSnsyData = async (chain: string): Promise<ISnsyResponse> => (await postURL("https://www.sensay.io/api/snsy", { chain }));

export const fetchSnsyData = async (chain: string) => {
    const snsyData = await getSnsyData(chain);

    return {
        dailyNotionalVolume: Number(snsyData.daily_volume).toFixed(2),
        dailyPremiumVolume: Number(snsyData.daily_volume_premium).toFixed(2),
        totalNotionalVolume: Number(snsyData.total_volume).toFixed(2),
        totalPremiumVolume: Number(snsyData.total_volume_premium).toFixed(2),
    };
}

const v2_adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: async () => await fetchSnsyData(CHAIN.ETHEREUM),
            start: 0,
            runAtCurrTime: true
        },
        [CHAIN.BASE]: {
            fetch: async () => await fetchSnsyData(CHAIN.BASE),
            start: 0,
            runAtCurrTime: true
        },
        [CHAIN.ARBITRUM]: {
            fetch: async () => await fetchSnsyData(CHAIN.ARBITRUM),
            start: 0,
            runAtCurrTime: true
        },

    },
};


export default v2_adapter;
