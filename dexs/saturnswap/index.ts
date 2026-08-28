import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const startOfDay = options.startOfDay;
    const response = await fetchURL(`https://api.saturnswap.io/v1/defillama/volume?timestamp=${startOfDay}`);
    return {
        dailyVolume: response.volume.volume.toString(),
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.CARDANO],
    start: '2024-06-13',
};

export default adapter;
