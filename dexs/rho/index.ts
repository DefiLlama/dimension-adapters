import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
    const endpoint = 'https://ds.rhoservice.com/api/v1/stats/volume';
    const response = await fetchURL(endpoint);

    const dailyVolume = Number(response.volume);

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2024-05-29',
            meta: {
                hallmarks: [
                    [1747047600, 'Vault launch'],
                    [1743418800, 'Protocol public launch'],
                ],
            }
        }
    }
};

export default adapter;