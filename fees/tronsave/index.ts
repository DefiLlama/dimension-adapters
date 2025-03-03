import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const TRON_SAVE_ADDRESS = "TWZEhq5JuUVvGtutNgnRBATbF8BnHGyn4S";
const LIMIT = 50;

const getDailyFees = async (fromTimestamp: number, endTimestamp: number) => {
    let start = 0;
    let totalFees = 0;
    let hasMoreData = true;

    while (hasMoreData) {
        const trxTransactions = await httpGet(`https://apilist.tronscanapi.com/api/transfer/trx?address=${TRON_SAVE_ADDRESS}&start=${start}&limit=${LIMIT}&direction=2&reverse=false&start_timestamp=${fromTimestamp}&end_timestamp=${endTimestamp}`);

        if (trxTransactions.page_size === 0) {
            break;
        }

        totalFees += trxTransactions.data.reduce((acc: number, curr: any) => acc + Number(curr.amount) / 1000000, 0);
        // If we got fewer results than the limit, we've reached the end
        if (trxTransactions.page_size < LIMIT) {
            hasMoreData = false;
        } else {
            // Move to the next page
            start += LIMIT;
        }
    }
    return totalFees;
}

const fetch = async ({ createBalances, endTimestamp, fromTimestamp }: FetchOptions) => {
    const dailyRevenue = createBalances()
    const totalRevenue = await getDailyFees(fromTimestamp, endTimestamp)
    dailyRevenue.addCGToken('tron', totalRevenue)
    return {
        dailyFees: dailyRevenue,
        dailyRevenue: dailyRevenue
    };
}

export default {
    version: 2,
    adapter: {
        [CHAIN.TRON]: {
            fetch: fetch,
            start: 1738368000,
        },
    },
};
