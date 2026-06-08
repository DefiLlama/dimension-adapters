import { CHAIN } from "../helpers/chains"
import { Adapter, FetchOptions, } from '../adapters/types';
import fetchURL from "../utils/fetchURL";

const URL = "https://trade-info.dappos.com/market/archive?timestamp=";

interface Response {
    daily_trade_fee: string;
}

const fetch = async (options: FetchOptions) => {
    const url = `${URL}${options.startOfDay}`
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
    fetch,
    chains: [CHAIN.OP_BNB],
    start: '2025-01-01',
    deadFrom: "2025-09-23",
}
export default adapter