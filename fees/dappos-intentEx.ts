import { CHAIN } from "../helpers/chains"
import { Adapter, FetchOptions, } from '../adapters/types';
import fetchURL from "../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const URL = "https://trade-info.dappos.com/market/archive?timestamp=";

interface Response {
    daily_trade_fee: string;
}

const fetch = async (options: FetchOptions) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.endTimestamp * 1000));
    const url = `${URL}${dayTimestamp}`
    const data: Response[] = await fetchURL(url);
    const dailyFees = data.reduce((acc, item) => {
        return acc + Number(item.daily_trade_fee);
    }, 0);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.OP_BNB]: {
            fetch,
            start: '2025-01-01',
        },
    },
}
export default adapter