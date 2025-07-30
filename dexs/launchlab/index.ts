import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    daily_volume_sol: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
        WITH launchlab_trades AS (
            SELECT
                evt_block_time,
                amount_in,
                amount_out,
                json_value(trade_direction,'lax $.TradeDirection') AS trade_direction
            FROM
                raydium_solana.raydium_launchpad_evt_tradeevent
            WHERE
                evt_block_time >= from_unixtime(${options.startTimestamp})
                AND evt_block_time <= from_unixtime(${options.endTimestamp})
        )
        SELECT
            SUM(CASE 
                WHEN trade_direction = 'Buy' THEN amount_in
                WHEN trade_direction = 'Sell' THEN amount_out
            END) AS daily_volume_sol
        FROM
            launchlab_trades
    `)
    const dailyVolume = options.createBalances()
    dailyVolume.addCGToken('solana', data[0].daily_volume_sol / 1e9)

    return { 
        dailyVolume
    }
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-15'
        }
    },
    isExpensiveAdapter: true
}

export default adapter
