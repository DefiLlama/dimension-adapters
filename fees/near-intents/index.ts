import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const today = new Date(options.startOfDay * 1000).toISOString().slice(0, 16);

    const query = `SELECT
        date_at,
        COALESCE(SUM(TRY_CAST(fee AS DOUBLE)), 0) AS daily_fee
            FROM dune.near.dataset_near_intents_fees
            GROUP BY
        date_at`;

    const queryResults = await queryDuneSql(options, query);
    const feeToday = queryResults.find((result: { daily_fee: number, date_at: string }) => result.date_at === today)?.daily_fee ?? 0;

    dailyFees.addUSDValue(feeToday);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Protocol fees, org fees and api fees collected by Near Intents platform.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue is protocol revenue.",
};

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    chains: [CHAIN.NEAR],
    start: '2025-03-27',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
};

export default adapter;