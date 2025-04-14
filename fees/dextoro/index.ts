import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (timestamp: number, chainBlocks: any, options: FetchOptions) => {
    // source: https://dune.com/0xvitalii/dextoro-stats - created Optimized version of the official stats query.

    // https://dune.com/queries/4888269
    const value = (await queryDuneSql(options,
      `WITH
            liq_evts AS (
                SELECT
                    evt_tx_hash,
                evt_index,
                value
            FROM
                erc20_optimism.evt_Transfer
            WHERE
                contract_address = 0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9
                AND to = 0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF
        ),
        liq_table_appended as (
            select
                coalesce(
                    cast(stakersFee as double),
                    cast(lq.value as double),
                    0
                ) as stakersFee_appended,
                pl.evt_tx_hash,
                pl.evt_index,
                pl.account
            from
                synthetix_futuresmarket_optimism.ProxyPerpsV2_evt_PositionLiquidated pl
                left JOIN liq_evts lq on pl.evt_tx_hash = lq.evt_tx_hash
                and pl.evt_index = (lq.evt_index - 1)
        ),
        liquidation_pre AS (
            SELECT
                NULL as tracking_code,
                pm.evt_tx_hash,
                pm.evt_block_time,
                pm.account,
                CAST(lq.stakersFee_appended AS DOUBLE) / 1e18 AS fee,
                CAST(pm.price AS DOUBLE) / 1e18 AS lastPrice,
                - CAST(pm.size AS DOUBLE) / 1e18 AS tradeSize
            FROM
                synthetix_futuresmarket_optimism.ProxyPerpsV2_evt_PositionLiquidated pm
                LEFT JOIN synthetix_futuresmarket_optimism.ProxyPerpsV2_evt_PerpsTracking ft ON pm.evt_tx_hash = ft.evt_tx_hash
                AND pm.fee = ft.fee
                left JOIN liq_table_appended lq on pm.evt_tx_hash = lq.evt_tx_hash
                and pm.account = (lq.account)
        ),
        liquidation_table AS (
            SELECT
                a.tracking_code,
                a.evt_block_time,
                a.account,
                a.fee,
                ABS(
                    CAST(a.tradeSize AS DOUBLE) * CAST(a.lastPrice AS DOUBLE)
                ) AS volume
            FROM
                liquidation_pre a
        ),
        position_join_table as (
            select
                (frontend) as tracking_code,
                tx_hash as evt_tx_hash,
                block_time as evt_block_time,
                trader as account
            from
                synthetix.perpetual_trades
            where
                cast(version as integer) = 2
        ),
        trades_pre as (
            select
                pj.tracking_code,
                pj.evt_tx_hash,
                pj.evt_block_time,
                pj.account,
                cast(pm.fee as double) / pow(10, 18) as fee,
                cast(pm.tradeSize as double) / pow(10, 18) as tradeSize,
                ABS(
                    CAST(pm.tradeSize AS DOUBLE) / pow(10, 18) * CAST(pm.lastPrice AS DOUBLE) / pow(10, 18)
                ) AS volume
            from
                synthetix_futuresmarket_optimism.ProxyPerpsV2_evt_PositionModified pm
                inner join position_join_table pj on cast(pm.evt_tx_hash as varchar) = cast(pj.evt_tx_hash as varchar)
                and cast(pm.account as varchar) = cast(pj.account as varchar)
            where
                cast(tradeSize as double) != 0
        ),
        final_trades as (
            select
                cast(
                    coalesce(
                        tracking_code,
                        lag(tracking_code) ignore nulls over (
                            partition by
                                account
                            order by
                                evt_block_time
                        )
                    ) as varchar
                ) as tracking_code,
                evt_block_time,
                account,
                fee,
                volume
            from
                (
                    select
                        cast(tracking_code as varchar) as tracking_code,
                        cast(evt_block_time as timestamp) as evt_block_time,
                        cast(account as varchar) as account,
                        cast(fee as double) as fee,
                        cast(volume as double) as volume
                    from
                        trades_pre
                    union all
                    select
                        NULL as tracking_code,
                        cast(evt_block_time as timestamp) as evt_block_time,
                        cast(account as varchar) as account,
                        cast(fee as double) as fee,
                        cast(volume as double) as volume
                    from
                        liquidation_table
                )
            order by
                evt_block_time desc
        ),
        trades as (
            select
                regexp_extract(
                    trim(
                        '\\u00'
                        from
                            tracking_code
                    ),
                    '([A-z]+)',
                    1
                ) as tracking_code,
                evt_block_time,
                fee,
                volume
            From
                final_trades
        )
    SELECT
        SUM(fee) AS fees,
        SUM(volume) AS volume
    FROM
        trades
    WHERE
        evt_block_time BETWEEN from_unixtime(${options.startTimestamp}) AND from_unixtime(${options.endTimestamp})
        AND regexp_extract(
            trim(
                '\\u00'
                FROM
                    tracking_code
            ),
            '([A-z]+)',
            1
        ) = 'Dextoro'
    `));

    const dailyFees = value[0].fees ? value[0].fees : 0;

    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.OPTIMISM]: {
            fetch: fetch,
            start: '2023-11-08'
        },
    },
    isExpensiveAdapter: true
};

export default adapter;
