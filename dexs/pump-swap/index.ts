import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

// const queryId = "4900425"; // removed direct query so changes in query don't affect the data, and better visibility

interface IData {
    usd_volume: number;
    usd_fees: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
        SELECT 
            SUM(CAST(amount_usd AS DOUBLE)) AS usd_volume,
            SUM(CAST(fee_usd AS DOUBLE)) AS usd_fees
        FROM dex_solana.trades
        WHERE project = 'pumpswap'
            AND block_time >= from_unixtime(${options.startTimestamp})
            AND block_time <= from_unixtime(${options.endTimestamp})
    `)
    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()
    // console.log(data)
    dailyVolume.addCGToken('tether', data[0].usd_volume);
    dailyFees.addCGToken('tether', data[0].usd_fees);

    return { 
        dailyVolume,
        dailyFees
    }
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-03-15'
        }
    },
    version: 1,
    isExpensiveAdapter: true
}

export default adapter
