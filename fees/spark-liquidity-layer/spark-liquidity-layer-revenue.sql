with daily_changes AS (
    SELECT
        DATE(evt_block_time) as dt,
        contract_address,
        SUM(
            CASE
                WHEN "to" = 0x2917956eFF0B5eaF030abDB4EF4296DF775009cA
                    THEN value / 1e18
                WHEN "from" = 0x2917956eFF0B5eaF030abDB4EF4296DF775009cA
                    THEN -(value / 1e18)
                ELSE 0
            END
        ) as daily_net_change
    FROM thirdweb_base.morphotokenoptimism_evt_transfer
    WHERE
        (
            "from" = 0x2917956eFF0B5eaF030abDB4EF4296DF775009cA
            OR "to" = 0x2917956eFF0B5eaF030abDB4EF4296DF775009cA
        )
    GROUP BY 1, 2
),
morpho_rewards as (
    SELECT
        b.dt,
        'base' as blockchain,
        'Morpho' as protocol_name,
        'USDC' as token_symbol,
        b.daily_net_change as MORPHO_rewards,
        p.price as MORPHO_price_usd,
        b.daily_net_change * p.price as MORPHO_rewards_usd,
        SUM(b.daily_net_change) OVER (
            ORDER BY b.dt ROWS UNBOUNDED PRECEDING
        ) as cumulative_MORPHO_balance,
        SUM(b.daily_net_change) OVER (
            ORDER BY b.dt ROWS UNBOUNDED PRECEDING
        ) * p.price as cumulative_MORPHO_balance_usd
    FROM daily_changes b
    LEFT JOIN prices.day p
        ON b.contract_address = p.contract_address
        AND b.dt = DATE(p.timestamp)
        AND p.blockchain = 'base'
    ORDER BY b.dt DESC
),
-- Define date range constants for the query
date_constants AS (
    SELECT
        DATE '2024-09-04' AS start_date,
        -- Query start date
        CURRENT_DATE AS end_date -- Query end date (today)
),
-- Extract all sUSDS transaction exchange rate data
susds_realtime_rates_raw AS (
    SELECT
        evt_block_time,
        -- Transaction timestamp
        evt_index,
        -- Event index for ordering
        cast(assets as double) / cast(shares as double) as susds_conversion_rate -- Calculate conversion rate
    FROM (
            -- Get all deposit transactions
            SELECT
                evt_block_time,
                evt_index,
                assets,
                shares
            FROM sky_ethereum.susds_evt_deposit
            CROSS JOIN date_constants dc
            WHERE
                shares > 0 -- Filter out zero-share transactions
                AND evt_block_time >= dc.start_date -- Filter by start date
                AND evt_block_time <= dc.end_date + INTERVAL '1' DAY -- Filter by end date (inclusive)
            UNION ALL
            -- Get all withdrawal transactions
            SELECT
                evt_block_time,
                evt_index,
                assets,
                shares
            FROM sky_ethereum.susds_evt_withdraw
            CROSS JOIN date_constants dc
            WHERE
                shares > 0 -- Filter out zero-share transactions
                AND evt_block_time >= dc.start_date -- Filter by start date
                AND evt_block_time <= dc.end_date + INTERVAL '1' DAY -- Filter by end date (inclusive)
        )
),
-- Get the last exchange rate for each day
daily_last_rates AS (
    SELECT
        DATE(evt_block_time) as dt,
        -- Extract date from timestamp
        MAX_BY(susds_conversion_rate, evt_block_time) as susds_conversion_rate -- Get rate at latest time each day
    FROM susds_realtime_rates_raw
    GROUP BY DATE(evt_block_time) -- Group by date
),
-- Generate complete date sequence for the specified range
date_series AS (
    SELECT
        dt
    FROM UNNEST(
            SEQUENCE(
                (
                    SELECT
                        start_date
                    FROM date_constants
                ),
                -- Start of sequence
                (
                    SELECT
                        end_date
                    FROM date_constants
                ),
                -- End of sequence
                INTERVAL '1' DAY -- Daily increment
            )
        ) AS t(dt)
),
-- Fill missing dates with previous day's exchange rate
complete_daily_rates AS (
    SELECT
        ds.dt,
        -- Date from complete series
        COALESCE(
            dlr.susds_conversion_rate,
            -- Use actual rate if available
            LAST_VALUE(dlr.susds_conversion_rate) IGNORE NULLS -- Otherwise use previous non-null rate
            OVER (
                ORDER BY ds.dt ROWS BETWEEN UNBOUNDED PRECEDING
                    AND CURRENT ROW
            )
        ) as susds_conversion_rate
    FROM date_series ds
    LEFT JOIN daily_last_rates dlr
        ON ds.dt = dlr.dt -- Join with actual rates
),
-- Final output with rate change calculations
conversion as (
    SELECT
        dt,
        -- Date
        susds_conversion_rate -- Daily exchange rate
    FROM complete_daily_rates
    ORDER BY dt DESC -- Order by date descending (newest first)
),
protocols_data as (
    select
        *
    from (
            select
                dt,
                blockchain,
                protocol_name,
                token_symbol,
                reward_code,
                reward_per,
                interest_code,
                interest_per,
                alm_idle as amount
            from dune.sparkdotfi.result_spark_idle_dai_usds_in_sparklend_by_alm_proxy -- Spark - Idle DAI & USDS in Sparklend by ALM Proxy
            where
                alm_supply_amount > 0
            union all
            select
                dt,
                blockchain,
                protocol_name,
                token_symbol,
                reward_code,
                reward_per,
                interest_code,
                interest_per,
                amount
            from dune.sparkdotfi.result_spark_usds_s_usds_usdc_in_psm_3_curve_psm_3_proxy_foundation_aave -- Spark - USDS, sUSDS & USDC in PSM3, Curve, Maple, PSM3, Proxy, Treasury, Foundation
            union all
            select
                dt,
                blockchain,
                protocol_name,
                token_symbol,
                reward_code,
                reward_per,
                interest_code,
                interest_per,
                amount
            from dune.sparkdotfi.result_spark_pt_usds_14_aug_2025_in_sp_dai_vault_on_morpho -- Spark - PT-USDS-14AUG2025 in spDAI vault on Morpho
            union all
            select
                dt,
                blockchain,
                protocol_name,
                token_symbol,
                reward_code,
                reward_per,
                interest_code,
                interest_per,
                alm_idle as amount
            from dune.sparkdotfi.result_spark_idle_usds_in_aave_by_alm_proxy -- Spark - Idle USDS in AAVE by ALM Proxy
            union all
            select
                dt,
                blockchain,
                protocol_name,
                token_symbol,
                reward_code,
                reward_per,
                interest_code,
                interest_per,
                alm_idle as amount
            from dune.sparkdotfi.result_spark_idle_dai_usdc_in_morpho_by_alm_proxy -- Spark - Idle DAI & USDC in Morpho by ALM Proxy
            union all
            select
                dt,
                blockchain,
                protocol_name,
                token_symbol,
                reward_code,
                reward_per,
                interest_code,
                interest_per,
                amount
            from dune.sparkdotfi.result_spark_pendle_farms -- Spark - Pendle Pools
            union all
            select
                dt,
                blockchain,
                protocol_name,
                token_symbol,
                reward_code,
                reward_per,
                interest_code,
                interest_per,
                amount
            from dune.sparkdotfi.result_spark_maple_syrup_usdc_by_alm_proxy -- Spark - Maple syrupUSDC by ALM Proxy
            union all
            select
                dt,
                blockchain,
                protocol_name,
                token_symbol,
                reward_code,
                reward_per,
                interest_code,
                interest_per,
                amount
            from dune.sparkdotfi.result_spark_ethena_payout_apy -- Spark - Ethena Payout
        ) p
),
protocols_daily as (
    select
        dt,
        token_symbol,
        case
            when protocol_name = 'Morpho'
            and token_symbol = 'USDC'
                then concat(
                protocol_name,
                ' - ',
                token_symbol,
                ' - ',
                blockchain
            )
            else concat(protocol_name, ' - ', token_symbol)
        end as "protocol-token",
        p.reward_code,
        p.reward_per,
        p.interest_code,
        p.interest_per,
        sum(p.amount) / 365 as tw_amount,
        sum(
            case
                when protocol_name = 'Sparklend'
                    then (sl.interest_amount - sl.BR_cost) / 365
                when protocol_name = 'Morpho'
                and token_symbol in ('DAI', 'USDC', 'USDS')
                    then (m.interest_amount - m.BR_cost) / 365 + coalesce(mr.MORPHO_rewards_usd, 0)
                when protocol_name = 'ethena'
                    then e.daily_actual_revenue - e.daily_BR_cost
                else (p.amount / 365) * p.reward_per + (p.amount / 365) * p.interest_per
            end
        ) as tw_net_rev_interest,
        sum(
            case
                when protocol_name = 'Sparklend'
                    then sl.interest_amount / 365
                when protocol_name = 'Morpho'
                and token_symbol in ('DAI', 'USDC', 'USDS')
                    then m.interest_amount / 365 + coalesce(mr.MORPHO_rewards_usd, 0)
                when protocol_name = 'ethena'
                    then e.daily_actual_revenue
                else (p.amount / 365) * p.reward_per + (p.amount / 365) * p.interest_per
            end
        ) as tw_net_fees
    from protocols_data p
    left join dune.sparkdotfi.result_spark_idle_dai_usds_in_sparklend_by_alm_proxy sl
        using (dt, protocol_name, token_symbol, blockchain)
    left join dune.sparkdotfi.result_spark_idle_dai_usdc_in_morpho_by_alm_proxy m
        using (dt, protocol_name, token_symbol, blockchain)
    left join dune.sparkdotfi.result_spark_ethena_payout_apy e
        using (dt, protocol_name, token_symbol, blockchain)
    left join morpho_rewards mr
        using (dt, protocol_name, token_symbol, blockchain)
    group by 1, 2, 3, 4, 5, 6, 7
),
protocols_daily_usd as (
    select
        b.*,
        case
            when b.token_symbol in ('sUSDS', 'sUSDC')
                then p.susds_conversion_rate
            else 1
        end as price_usd,
        case
            when b.token_symbol in ('sUSDS', 'sUSDC')
                then b.tw_net_rev_interest * p.susds_conversion_rate
            else b.tw_net_rev_interest
        end as tw_net_rev_interest_usd,
        case
            when b.token_symbol in ('sUSDS', 'sUSDC')
                then b.tw_net_fees * p.susds_conversion_rate
            else b.tw_net_fees
        end as tw_net_fees_usd
    from protocols_daily b
    left join conversion p
        on b.dt = p.dt
)
select
    dt,
    sum(tw_net_rev_interest_usd) as revenue,
    sum(tw_net_fees_usd) as fees
from protocols_daily_usd
where dt = date '{{dt}}'
group by 1
