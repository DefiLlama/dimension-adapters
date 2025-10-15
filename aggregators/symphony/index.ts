import { Adapter, FetchOptions, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API_ENDPOINT = "http://stats.symphony.ag/api/v1/stats";

interface IVolumeResponse {
    last24Hours: {
        volumeUSD: number;
    };
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const data: IVolumeResponse = await fetchURL(`${API_ENDPOINT}?timestamp=${options.startOfDay}`);
    return {
        dailyVolume: data.last24Hours.volumeUSD.toString(),
    };
};

const adapter: Adapter = {
    version: 2,
    methodology: 'Tracks the total value of all trades executed through Symphony Aggregator on SEI chain. Volume is calculated by summing the USD value of all trades.',
    fetch,
    adapter: {
        [CHAIN.SEI]: {
            start: '2024-08-25', // Aug 26, 2024 00:00:00 UTC
        },
    },
};

export default adapter;