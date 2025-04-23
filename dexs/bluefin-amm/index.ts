import {BreakdownAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {httpGet} from "../../utils/fetchURL";


const fetchSUI = async (timestamp: number) => {
    const exchangeInfo = await httpGet("https://swap.api.sui-prod.bluefin.io/api/v1/info");
    const pools = await httpGet("https://swap.api.sui-prod.bluefin.io/api/v1/pools/info");
    const rfqStats = await httpGet("https://swap.api.sui-prod.bluefin.io/api/rfq/stats?interval=1d");
    let spotDailyVolume = 0;
    for (const pool of pools) {
        spotDailyVolume += Number(pool.day.volume);
    }
    const dailyVolume = spotDailyVolume + Number(rfqStats.volumeUsd);
    const totalVolume = Number(exchangeInfo.totalVolume) + Number(exchangeInfo.rfqTotalVolume);
    return {
        totalVolume: totalVolume ? totalVolume : undefined,
        dailyVolume: dailyVolume,
        timestamp: timestamp,
    }
};

const adapter: BreakdownAdapter = {
    breakdown: {
        dexes: {
            [CHAIN.SUI]: {
                fetch: fetchSUI,
                start: '2024-11-19',
                runAtCurrTime: true
            },
        },
    },
};

export default adapter;
