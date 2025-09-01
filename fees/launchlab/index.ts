import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    protocol_fees: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
        WITH launchlab_trades AS (
            SELECT
                evt_block_time,
                protocol_fee,
                platform_fee,
                share_fee
            FROM
                raydium_solana.raydium_launchpad_evt_tradeevent
            WHERE
                evt_block_time >= from_unixtime(${options.startTimestamp})
                AND evt_block_time <= from_unixtime(${options.endTimestamp})
        )
        SELECT
            SUM(protocol_fee) AS protocol_fees
        FROM
            launchlab_trades
    `)
    const dailyFees = options.createBalances()
    dailyFees.addCGToken('solana', Number(data[0].protocol_fees / 1e9))
    const dailyHoldersRevenue = dailyFees.clone(0.25) // 25% of is burned
    const dailyProtocolRevenue = dailyFees.clone(0.75) // 75% of fees go to the protocol

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailyHoldersRevenue
    }
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-15',
        }
    },
    version: 1,
    isExpensiveAdapter: true,
    methodology: {
        Fees: '1% platform fee on all transactions.',
        Revenue: '0.25% burned + 0.75% to protocol of 1% platform fees',
        ProtocolRevenue: '0.75% of platform fees go to the protocol.',
        HoldersRevenue: '0.25% of platform fees are burned.',
    }
}

export default adapter
