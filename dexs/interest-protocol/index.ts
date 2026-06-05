import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const getVolumeURL = 'https://www.api.interestprotocol.com/api/v2/analytics/getVolume'

interface GetVolumeReturn {
    totalVolume: number;
    volumeRecord: Record<string, Record<string, number>>;
    dailyVolume: number;
    dailyVolumePerMarket: Record<string, Record<string, number>>;
    timestamp: number;
}

const fetch = async (_options: FetchOptions) => {
    const volumeData: GetVolumeReturn = (await fetchURL(getVolumeURL));

    return {
        dailyVolume: volumeData.dailyVolume.toString(),
        timestamp: volumeData.timestamp,
    };
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SUI],
    start: '2023-05-13',
    runAtCurrTime: true,
};

export default adapter;
