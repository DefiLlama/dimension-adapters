import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {

    const volumeRes = await queryDuneSql(options, `
        with topUpCollateral as (
            SELECT
                tradeId as trade_id,
                sum(topUpAmount) as added_collateral_usdc
            From ostium_labs_arbitrum.OstiumTrading_evt_TopUpCollateralExecuted
            WHERE
                evt_block_time >= from_unixtime(${options.startTimestamp})
                AND evt_block_time < from_unixtime(${options.endTimestamp})
            GROUP BY tradeId
        ),
        removeCollateral as (
            SELECT
                tradeId as trade_id,
                sum(removeAmount) as remove_collateral_usdc
            FROM ostium_labs_arbitrum.ostiumtradingcallbacks_evt_removecollateralexecuted
            WHERE
                evt_block_time >= from_unixtime(${options.startTimestamp})
                AND evt_block_time < from_unixtime(${options.endTimestamp})
            GROUP BY tradeId
        ),
        open_orders as (
            SELECT
                evt_block_time AS block_time,
                orderId as trade_id,
                CAST(CAST(json_extract(t, '$.collateral') AS varchar) AS uint256) AS collateral_usdc,
                CAST(CAST(json_extract(t, '$.leverage') AS varchar) AS uint256) AS leverage
            FROM ostium_labs_arbitrum.OstiumTradingCallbacks_evt_LimitOpenExecuted
            WHERE
                evt_block_time >= from_unixtime(${options.startTimestamp})
                AND evt_block_time < from_unixtime(${options.endTimestamp})

            UNION

            SELECT
                evt_block_time AS block_time,
                orderId as trade_id,
                CAST(CAST(json_extract(t, '$.collateral') AS varchar) AS uint256) AS collateral_usdc,
                CAST(CAST(json_extract(t, '$.leverage') AS varchar) AS uint256) AS leverage
            FROM ostium_labs_arbitrum.OstiumTradingCallbacks_evt_MarketOpenExecuted
            WHERE
                evt_block_time >= from_unixtime(${options.startTimestamp})
                AND evt_block_time < from_unixtime(${options.endTimestamp})
        ),
        trades as (
            SELECT
                (a.collateral_usdc + coalesce(i.added_collateral_usdc, 0) - coalesce(j.remove_collateral_usdc, 0)) / 1e6 as collateral_usdc, -- includes added collateral
                (a.leverage / 1e2 * a.collateral_usdc / 1e6) / ((a.collateral_usdc + coalesce(i.added_collateral_usdc, 0) - coalesce(j.remove_collateral_usdc, 0)) / 1e6) as leverage
            from open_orders a
            left join topUpCollateral i on a.trade_id = i.trade_id
            left join removeCollateral j on a.trade_id = j.trade_id
        )
        SELECT SUM((collateral_usdc + collateral_usdc) * leverage) as volume FROM trades
    `);
    const dailyVolume = volumeRes[0].volume;

    return {
        dailyVolume
    }
}

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetch as any,
            start: '2025-04-16'
        },
    },
    isExpensiveAdapter: true
}

export default adapter;
