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
        ('ethereum', 0x2260fac5e5542a773aa44fbcfedf7c193bc2c599, 'WBTC')
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
                                and token_symbol in ('DAI', 'USDC','USDS') then m.net_rev_interest / 365
                            when protocol_name = 'ethena' then e.daily_actual_revenue - e.daily_BR_cost
                            else (p.amount / 365) * p.reward_per + (p.amount / 365) * p.interest_per
                            end
                ) as tw_net_rev_interest
         from protocols_data p
                  left join dune.sparkdotfi.result_spark_idle_dai_usds_in_sparklend_by_alm_proxy sl using (dt, protocol_name, token_symbol) -- Spark - Idle DAI & USDS in Sparklend by ALM Proxy
                  left join dune.sparkdotfi.result_spark_idle_dai_usdc_in_morpho_by_alm_proxy m using (dt, protocol_name, token_symbol) -- Spark - Idle DAI & USDC in Morpho by ALM Proxy
                  left join dune.sparkdotfi.result_spark_ethena_payout_apy e using (dt, protocol_name, token_symbol) -- Spark - Ethena Payout + APY
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
                b.tw_net_rev_interest * p.price_usd as tw_net_rev_interest_usd
         from protocols_daily b
                  join tokens t on b.token_symbol = t.token_symbol
                  left join dune.steakhouse.result_token_price p on t.blockchain = p.blockchain
             and t.token_address = p.token_address
             and b.dt = p.dt
     )
select dt, sum(tw_net_rev_interest_usd) as revenue
from protocols_daily_usd
where dt = date '{{dt}}'
group by 1