import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";



const fetch_sui = async (timestamp: number): Promise<FetchResultFees> => {
    const exchangeInfo= await fetchURL("https://swap.api.sui-prod.bluefin.io/api/v1/info");
    const pools = await fetchURL("https://swap.api.sui-prod.bluefin.io/api/v1/pools/info");
    let dailyFees = 0;
    for (const pool of pools) {
        dailyFees += Number(pool.day.fee);
    }
    const totalFees=exchangeInfo.totalFee;
    const dailyRevenue = dailyFees * 0.2;
    const totalRevenue = totalFees * 0.2;

    return {
        dailyFees,
        totalFees,
        dailyRevenue,
        totalRevenue: totalRevenue,
        timestamp: timestamp,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetch_sui,
            start: '2024-11-19',
            runAtCurrTime: true,
        },
    },
};

export default adapter;
