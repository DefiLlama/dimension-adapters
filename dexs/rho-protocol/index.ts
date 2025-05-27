import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
    let endpoint = 'https://ds.rhoservice.com/api/v1/stats/volume/range';
    const params: string[] = [];
    
    if (options.startTimestamp) params.push(`from=${options.startTimestamp}`);
    if (options.endTimestamp) params.push(`to=${options.endTimestamp}`);
    if (params.length) endpoint += `?${params.join('&')}`;

    
    const response = await fetchURL(endpoint);
    const dailyVolume = Number(response.volume);

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
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