import { FetchOptions, SimpleAdapter, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const duneQuery = `
        SELECT
            total_open_interest
        FROM
            dune.txflow_mainnet.platform_hourly_oi
        WHERE
            hour_ts = ${options.startOfDay}
    `;

    const result = await queryDuneSql(options, duneQuery);

    if (!result || result.length === 0) {
        throw new Error(`No data found for date ${options.dateString}`);
    }

    const openInterestAtEnd = options.createBalances();
    openInterestAtEnd.addUSDValue(result[0].total_open_interest);

    return {
        openInterestAtEnd,
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.TXFLOW],
    start: '2026-03-26',
    isExpensiveAdapter: true,
    dependencies: [Dependencies.DUNE],
}

export default adapter;