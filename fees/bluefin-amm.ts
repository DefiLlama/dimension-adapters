import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


const fetch = async (timestamp: number): Promise<FetchResultFees> => {
    const pools = await fetchURL("https://swap.api.sui-prod.bluefin.io/api/v1/pools/info");
    const rfqStats = await fetchURL("https://swap.api.sui-prod.bluefin.io/api/rfq/stats?interval=1d");

    let spotFees = 0;
    for (const pool of pools) {
        spotFees += Number(pool.day.fee);
    }
    const dailyRevenue = (spotFees * 0.2) + Number(rfqStats.feesUsd);
    const dailyFees = spotFees + Number(rfqStats.feesUsd);

    return {
        dailyFees,
        dailyRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SUI]: {
            fetch,
            start: '2024-11-19',
            runAtCurrTime: true,
        },
    },
};

export default adapter;
