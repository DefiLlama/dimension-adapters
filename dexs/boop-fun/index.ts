import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    total_volume: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
        WITH buy_volume AS (
            SELECT
                SUM(buy_amount) / 1e9 AS volume
            FROM
                boopdotfun_solana.boop_call_buy_token
            WHERE
                call_block_time >= from_unixtime(${options.startTimestamp})
                and call_block_time <= from_unixtime(${options.endTimestamp})
        ),
        sell_volume AS (
            SELECT
                SUM(amount_out_min) / 1e9 AS volume
            FROM
                boopdotfun_solana.boop_call_sell_token
            WHERE
                call_block_time >= from_unixtime(${options.startTimestamp})
                and call_block_time <= from_unixtime(${options.endTimestamp})
        )
        SELECT
            COALESCE((SELECT volume FROM buy_volume), 0) + COALESCE((SELECT volume FROM sell_volume), 0) AS total_volume
    `)
    const dailyVolume = options.createBalances();
    dailyVolume.addCGToken('solana', data[0].total_volume);

    return {
        dailyVolume
    };
};


const adapter: SimpleAdapter = {
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.SOLANA],
    start: '2025-05-01',
    isExpensiveAdapter: true
}

export default adapter
