import { Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import { queryDuneSql } from "./dune";

export function duneSolanaDexTrades(project: string, start: string) {
    const fetch = async (_a: any, _b: any, options: FetchOptions) => {
        const now = Date.now()
        const tenHoursAgo = now - (10 * 60 * 60 * 1000)
        if ((options.toTimestamp * 1000) > tenHoursAgo) {
            console.log("End timestamp is less than 10 hours ago, skipping fetch due to dune indexing delay", new Date(options.toTimestamp * 1000).toISOString(), new Date(tenHoursAgo).toISOString())
            throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
        }

        const query = `
            SELECT
                COALESCE(SUM(amount_usd), 0) AS daily_volume
            FROM
                dex_solana.trades
            WHERE
                TIME_RANGE
                AND project = '${project}'
        `;
        const data = await queryDuneSql(options, query)

        return {
            dailyVolume: data[0].daily_volume,
        }
    }

    return {
        fetch,
        chains: [CHAIN.SOLANA],
        start,
        dependencies: [Dependencies.DUNE],
        isExpensiveAdapter: true,
    }
}