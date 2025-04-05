import {CHAIN} from "../../helpers/chains";
import {FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL"
import { FetchOptions } from "../../adapters/types";

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultVolume> => {
    const from_date = getUniqStartOfTodayTimestamp(new Date(options.startOfDay * 1000));
    const to_date = from_date + 86400;
    const data = (await fetchURL(`https://serverprod.vest.exchange/v2/exchangeInfo/volume?from_date=${from_date * 1000}&to_date=${to_date * 1000}`));
    console.log(data)
    return {
        dailyVolume: data.total,
        timestamp: timestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: '2025-01-01',
        },
    },
};
export default adapter;