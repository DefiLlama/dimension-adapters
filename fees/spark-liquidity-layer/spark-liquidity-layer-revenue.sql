with tokens (blockchain, token_address, token_symbol) as (
    values
        ('ethereum', 0x6B175474E89094C44Da98b954EedeAC495271d0F, 'DAI'),
        ('ethereum', 0x6B175474E89094C44Da98b954EedeAC495271d0F, 'PT-USDS/DAI'), -- for Morpho PT-USDS/DAI
        ('ethereum', 0xdC035D45d973E3EC169d2276DDab16f1e407384F, 'SY-USDS'), -- for Pendle SY token in PT-USDS-14AUG2025 (assuming 1 SY = 1$ value)
        ('ethereum', 0xdC035D45d973E3EC169d2276DDab16f1e407384F, 'SY-USDS-SPK'), -- for SPK farm
        ('ethereum', 0xdC035D45d973E3EC169d2276DDab16f1e407384F, 'stakedUSDS'), -- for staked USDS in farm
        ('ethereum', 0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD, 'sUSDS'),
        ('ethereum', 0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD, 'sUSDC'), -- sUSDC is a wrapper for sUSDS
        ('ethereum', 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, 'USDC'),
        ('ethereum', 0x4c9EDD5852cd905f086C759E8383e09bff1E68B3, 'USDe'),
        ('ethereum', 0xdC035D45d973E3EC169d2276DDab16f1e407384F, 'USDS'),
        ('ethereum', 0xdAC17F958D2ee523a2206206994597C13D831ec7, 'USDT'),
        ('ethereum', 0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0, 'wstETH'),
        ('ethereum', 0xbf5495efe5db9ce00f80364c8b423567e58d2110, 'ezETH'),
        ('ethereum', 0xae78736cd615f374d3085123a210448e74fc6393, 'rETH'),
        ('ethereum', 0xa1290d69c65a6fe4df752f95823fae25cb99e5a7, 'rsETH'),
        ('ethereum', 0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee, 'weETH'),
        ('ethereum', 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2, 'WETH'),
        ('ethereum', 0x6c3ea9036406852006290770bedfcaba0e23a0e8, 'PYUSD'),
        ('ethereum', 0x6810e776880c02933d47db1b9fc05908e5386b96, 'GNO'),
        ('ethereum', 0x83f20f44975d03b1b09e64809b757c47f942beea, 'sDAI'),
        ('ethereum', 0x8236a87084f8b84306f72007f36f2618a5634494, 'LBTC'),
        ('ethereum', 0x18084fba666a33d37592fa2633fd49a74dd93a88, 'tBTC'),
        ('ethereum', 0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf, 'cbBTC'),
        ('ethereum', 0x2260fac5e5542a773aa44fbcfedf7c193bc2c599, 'WBTC'),
        ('base', 0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842, 'MORPHO')
),
    morpho_daily_changes AS (
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
        GROUP BY 1,2
    ),
    -- Get USDC token info for price lookup
    usdc_token AS (
        SELECT
            blockchain,
            token_address
        FROM tokens
        WHERE token_symbol = 'USDC'
        LIMIT 1  -- In case there are multiple USDC entries
    ),
    morpho_rewards AS (
        SELECT
            b.dt,
            'base' as blockchain,
            'Morpho' as protocol_name,
            'USDC' as token_symbol,
            b.daily_net_change as MORPHO_rewards,
            p.price_usd as MORPHO_price_usd,
            b.daily_net_change * p.price_usd as MORPHO_rewards_usd,
            -- Add USDC price for the same date
            p_usdc.price_usd as USDC_price_usd,
            b.daily_net_change * p.price_usd/p_usdc.price_usd as MORPHO_rewards_USDC,
            SUM(b.daily_net_change) OVER (
                ORDER BY b.dt ROWS UNBOUNDED PRECEDING
            ) as cumulative_MORPHO_balance
        FROM morpho_daily_changes b
        JOIN tokens t
            ON b.contract_address = t.token_address
        LEFT JOIN dune.steakhouse.result_token_price p
            ON t.blockchain = p.blockchain
            AND t.token_address = p.token_address
            AND b.dt = p.dt
        -- Join USDC price for the same date
        LEFT JOIN usdc_token ut ON 1=1  -- Cross join to get USDC token info
        LEFT JOIN dune.steakhouse.result_token_price p_usdc
            ON ut.blockchain = p_usdc.blockchain
            AND ut.token_address = p_usdc.token_address
            AND b.dt = p_usdc.dt
        ORDER BY b.dt DESC
    ),
     protocols_data as (
         select *
         from (
                  select dt,
                         blockchain,
                         protocol_name,
                         token_symbol,
                         reward_code,
                         reward_per,
                         interest_code,
                         interest_per,
                         alm_idle as amount
                  from dune.sparkdotfi.result_spark_idle_dai_usds_in_sparklend_by_alm_proxy -- Spark - Idle DAI & USDS in Sparklend by ALM Proxy
                  where alm_supply_amount>0
                  union all
                  select dt,
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
                  select dt,
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
                  select dt,
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
                  select dt,
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
                  select dt,
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
                  select dt,
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
                  select dt,
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
         select dt,
                token_symbol,
                concat(protocol_name, ' - ', token_symbol) as "protocol-token",
                p.reward_code,
                p.reward_per,
                p.interest_code,
                p.interest_per,
                sum(p.amount) / 365 as tw_amount,
                sum(
                        case
                            when protocol_name = 'Sparklend' then (sl.interest_amount-sl.BR_cost) / 365
                            when protocol_name = 'Morpho'
                                and token_symbol in ('DAI', 'USDC','USDS') then (m.interest_amount-m.BR_cost) / 365 + coalesce(mr.MORPHO_rewards_USDC,0)
                            when protocol_name = 'ethena' then e.daily_actual_revenue - e.daily_BR_cost
                            else (p.amount / 365) * p.reward_per + (p.amount / 365) * p.interest_per
                            end
                ) as tw_net_rev_interest,
                sum(
                        case
                            when protocol_name = 'Sparklend' then sl.interest_amount / 365
                            when protocol_name = 'Morpho'
                                and token_symbol in ('DAI', 'USDC','USDS') then m.interest_amount / 365 + coalesce(mr.MORPHO_rewards_USDC,0)
                            when protocol_name = 'ethena' then e.daily_actual_revenue
                            else (p.amount / 365) * p.reward_per + (p.amount / 365) * p.interest_per
                            end
                ) as tw_net_fees
         from protocols_data p
                  left join dune.sparkdotfi.result_spark_idle_dai_usds_in_sparklend_by_alm_proxy sl using (dt, protocol_name, token_symbol) -- Spark - Idle DAI & USDS in Sparklend by ALM Proxy
                  left join dune.sparkdotfi.result_spark_idle_dai_usdc_in_morpho_by_alm_proxy m using (dt, protocol_name, token_symbol) -- Spark - Idle DAI & USDC in Morpho by ALM Proxy
                  left join dune.sparkdotfi.result_spark_ethena_payout_apy e using (dt, protocol_name, token_symbol) -- Spark - Ethena Payout + APY
                  left join morpho_rewards mr using (dt, protocol_name, token_symbol) --Spark - $MORPHO Rewards
         group by 1,
                  2,
                  3,
                  4,
                  5,
                  6,
                  7
     ),
     protocols_daily_usd as (
         select b.*,
                p.price_usd,
                b.tw_net_rev_interest * p.price_usd as tw_net_rev_interest_usd,
                b.tw_net_fees * p.price_usd as tw_net_fees_usd
         from protocols_daily b
                  join tokens t on b.token_symbol = t.token_symbol
                  left join dune.steakhouse.result_token_price p on t.blockchain = p.blockchain
             and t.token_address = p.token_address
             and b.dt = p.dt
     )
select dt, sum(tw_net_rev_interest_usd) as revenue, sum(tw_net_fees_usd) as fees
from protocols_daily_usd
where dt = date '{{dt}}'
group by 1