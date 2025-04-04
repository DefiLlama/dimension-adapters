import {CHAIN} from "../../helpers/chains";
import {FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL"

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {

    const toDayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const fromDayTimestamp = toDayTimestamp - 86400; // 60*60*24

    const data = (await fetchURL(`https://serverprod.vest.exchange/v2/exchangeInfo/volume?from_date=${fromDayTimestamp * 1000}&to_date=${toDayTimestamp * 1000}`));
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