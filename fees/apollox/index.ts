import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FeesAndRevenueURL =  "https://www.apollox.finance/bapi/futures/v1/public/future/apx/fee/all"

const fetch = async (_a: number, _b: any, options: FetchOptions) => {
    const chain = options.chain == CHAIN.OP_BNB ? "opbnb" : options.chain
    const url = `${FeesAndRevenueURL}?chain=${chain}`

    const { data } = await fetchURL(url)
    const { alpFeeVOFor24Hour } = data

    return {
        dailyFees: alpFeeVOFor24Hour.fee || 0,
        dailyRevenue: alpFeeVOFor24Hour.revenue || 0,
    };
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.BSC]: {
            runAtCurrTime: true,
            fetch,
            start: '2023-07-17',
        },
        [CHAIN.ARBITRUM]: {
            runAtCurrTime: true,
            fetch,
            start: '2023-07-17',
          },
          [CHAIN.OP_BNB]: {
            runAtCurrTime: true,
            fetch,
            start: '2023-07-17',
          },
          [CHAIN.BASE]: {
            runAtCurrTime: true,
            fetch,
            start: '2023-07-17',
          }
    }
}

export default adapter;
