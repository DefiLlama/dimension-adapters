import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";



const fetchSUI = async (timestamp: number) => {
    const exchangeInfo = await httpGet("https://swap.api.sui-prod.bluefin.io/api/v1/info");
    const pools = await httpGet("https://swap.api.sui-prod.bluefin.io/api/v1/pools/info");
    let dailyVolume = 0;
    for (const pool of pools) {
        dailyVolume += Number(pool.day.volume);
    }

 return {
     totalVolume: exchangeInfo ? exchangeInfo.totalVolume : undefined,
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
