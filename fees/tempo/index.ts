import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();

    const query = `
        SELECT
            COALESCE(SUM(gas_used * gas_price) / 1e18, 0) AS daily_txn_fees
        FROM
            tempo.transactions
        WHERE
            TIME_RANGE
    `;

    const queryResults = await queryDuneSql(options, query);

    dailyFees.addUSDValue(queryResults[0].daily_txn_fees)

    return { dailyFees, dailyRevenue: 0 };
}

const adapter: SimpleAdapter = {
    chains: [CHAIN.TEMPO],
    fetch,
    start: '2026-01-16',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN
}

export default adapter;