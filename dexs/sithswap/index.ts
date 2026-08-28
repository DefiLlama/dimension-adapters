import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";

interface DayData {
  id: string;
  date: number;
  totalVolumeUSD: string;
  dailyVolumeUSD: string;
}
const URL = 'https://api.sithswap.info/';

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
    const dayID = (options.startOfDay / 86400);
    const query = gql`
    {
      daydatas( orderBy: date, orderDirection: desc) {
        id
        date
        dailyVolumeUSD
        totalVolumeUSD
      }
    }
    `
    const response: DayData[] = (await request(URL, query)).daydatas;
    const volume = response.find((data: DayData) => data.id === dayID.toString());
    return {
        dailyVolume: volume?.dailyVolumeUSD ? `${volume.dailyVolumeUSD}` : undefined,
    };
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.STARKNET],
    start: '2023-01-10',
};

export default adapter;
