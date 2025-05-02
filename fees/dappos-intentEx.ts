import { CHAIN } from "../helpers/chains"
import { Adapter, FetchOptions, } from '../adapters/types';
import { httpGet } from "../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const URL = "https://trade-info.dappos.com/market/archive?timestamp=";

interface Response {
    daily_trade_fee: string;
    total_trade_fee: string;
}

const fetchFees = async (options: FetchOptions) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.endTimestamp * 1000));
    const url = `${URL}${dayTimestamp}`
    const respose: Response[] = await httpGet(url);
    const dailyFees = respose.reduce((acc, item) => {
        return acc + Number(item.daily_trade_fee);
    }, 0);
    const totalFees = respose.reduce((acc, item) => {
        return acc + Number(item.total_trade_fee);
    }, 0);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        totalFees,
        totalRevenue: totalFees,
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.OP_BNB]: {
            fetch: fetchFees,
            start: '2025-01-01',
        },
    },
}
export default adapter