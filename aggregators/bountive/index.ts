import fetchURL from "../../utils/fetchURL";
import { FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = 'https://api.bountive.fi/metrics/volume/';

interface IAPIResponse {
    date: number;
    dailyVolume: string;
}

const fetch = async ({ endTimestamp, startTimestamp }): Promise<FetchResultV2> => {
    const { dailyVolume }: IAPIResponse = await fetchURL(
      `${URL}${startTimestamp * 1000}/${endTimestamp * 1000}`,
    );
    return {
      dailyVolume,
    };
};
  
const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.STARKNET]: {
            fetch: fetch,
            start: '2024-11-20',
        },
    },
};

export default adapter;