import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";

const fetch = async (timestamp: any): Promise<FetchResultVolume> => {
    const startOfDay = timestamp.startOfDay;
    const response: any = await fetchURL(
        `https://api.saturnswap.io/v1/defillama/volume?timestamp=${startOfDay}`
    );
    const dailyVolume = response.volume.volume;
    return {
        dailyVolume: dailyVolume,
        timestamp: startOfDay,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.CARDANO]: {
            fetch,
            start: '2024-06-13',
        },
    },
};

export default adapter;
