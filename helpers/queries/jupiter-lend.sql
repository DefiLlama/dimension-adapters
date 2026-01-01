with

timeline as (
    select timestamp as day
    from utils.days
    where timestamp >= timestamp '2025-07-25'
        and timestamp < FROM_UNIXTIME({{end}})
)

, manual_pricing as (
    select * from "query_5169345"
)

, juplend_protocols as (
    select
          p.call_block_date as block_date
        , p.protocol
        , case
            when l.account_lending is not null then 'lending'
            when v.account_vault_config is not null then 'vault'
            when f.account_flashloan_admin is not null then 'flashloan'
            else 'other'
          end as protocol_type
        , p.supply_mint
        , p.borrow_mint
    from jupiter_solana.liquidity_call_init_new_protocol as p
    left join jupiter_solana.lending_call_init_lending as l on p.protocol = l.account_lending
    left join jupiter_solana.vaults_call_init_vault_config as v on p.protocol = v.account_vault_config
    left join jupiter_solana.flashloan_call_init_flashloan_admin as f on p.protocol = f.account_flashloan_admin
)

, juplend_protocol_tokens as (
    select protocol_type, mint, min(block_date) as block_date
    from (
        select protocol_type, supply_mint as mint, block_date from juplend_protocols
        union
        select protocol_type, borrow_mint as mint, block_date from juplend_protocols
    )
    group by 1, 2
)

, juplend_liquidity_tokens as (
    select i.call_block_date as block_date, i.account_mint as mint, i.account_vault as vault
    from jupiter_solana.liquidity_call_init_token_reserve as i
)

-- Parse exchange rates from LogOperate events
, liquidity_log_operate_raw as (
    select
          call_block_time as block_time
        , call_block_date as block_date
        , call_block_slot as block_slot
        , call_log_messages as log_messages
        , account_protocol as user
        , account_mint as token
        , supply_amount
        , borrow_amount
        , row_number() over (partition by call_tx_id order by call_outer_instruction_index asc) as rn
    from jupiter_solana.liquidity_call_operate
    where call_block_time < FROM_UNIXTIME({{end}})
)

, liquidity_log_operate_parsed as (
    select
          block_time
        , block_date
        , block_slot
        , user
        , token
        , supply_amount
        , borrow_amount
        , try(from_base64(split(log_messages.logs, ' ')[3])) as program_data
    from liquidity_log_operate_raw
    left join unnest(log_messages) with ordinality as log_messages(logs, log_index) on true
    where rn = 1
        and log_messages.logs like '%Program data:%'
        and try(from_base64(split(logs, ' ')[3])) is not null
        and varbinary_substring(from_base64(split(logs, ' ')[3]), 1, 8) = 0xb40851471384ad08
        and varbinary_length(try(from_base64(split(logs, ' ')[3]))) = 184
)

, liquidity_log_operate_events as (
    select
          block_time
        , block_date
        , block_slot
        , user
        , token
        , supply_amount
        , borrow_amount
        , varbinary_to_bigint(varbinary_reverse(varbinary_substring(program_data, 169, 8))) as supply_exchange_price
        , varbinary_to_bigint(varbinary_reverse(varbinary_substring(program_data, 177, 8))) as borrow_exchange_price
    from liquidity_log_operate_parsed
)

-- Parse exchange rates from LogUpdateRates events (fallback)
, lending_update_rate_raw as (
    select
          call_block_time as block_time
        , account_mint as token
        , call_log_messages as log_messages
        , row_number() over (partition by call_tx_id order by call_outer_instruction_index asc) as rn
    from jupiter_solana.lending_call_update_rate
    where call_block_time < FROM_UNIXTIME({{end}})
)

, lending_update_rate_parsed as (
    select
          block_time
        , token
        , try(from_base64(split(log_messages.logs, ' ')[3])) as program_data
    from lending_update_rate_raw
    left join unnest(log_messages) with ordinality as log_messages(logs, log_index) on true
    where rn = 1
        and log_messages.logs like '%Program data:%'
        and try(from_base64(split(logs, ' ')[3])) is not null
        and varbinary_substring(from_base64(split(logs, ' ')[3]), 1, 8) = 0xde0b713c930f44d9
)

, lending_update_rate_events as (
    select
          block_time
        , token
        , varbinary_to_bigint(varbinary_reverse(varbinary_substring(program_data, 9, 8))) as token_exchange_price
        , varbinary_to_bigint(varbinary_reverse(varbinary_substring(program_data, 17, 8))) as liquidity_exchange_price
    from lending_update_rate_parsed
)

-- Aggregate exchange rates by token and block_time
, exchange_rates_by_time as (
    select token, block_time, max(supply_exchange_price) as supply_exchange_price, max(borrow_exchange_price) as borrow_exchange_price
    from liquidity_log_operate_events
    group by 1, 2
)

, lending_rates_by_time as (
    select token, block_time, max(token_exchange_price) as token_exchange_price, max(liquidity_exchange_price) as liquidity_exchange_price
    from lending_update_rate_events
    group by 1, 2
)

-- Join operate events with exchange rates
, liquidity_operate_with_rates as (
    select
          op.block_time
        , op.block_date
        , op.block_slot
        , op.user
        , op.token
        , op.supply_amount
        , op.borrow_amount
        , op.supply_amount / (coalesce(op.supply_exchange_price, l.supply_exchange_price, e.liquidity_exchange_price, bigint '1000000000000') / 1e12) as supply_amount_raw
        , op.borrow_amount / (coalesce(op.borrow_exchange_price, l.borrow_exchange_price, bigint '1000000000000') / 1e12) as borrow_amount_raw
        , coalesce(op.supply_exchange_price, l.supply_exchange_price, e.liquidity_exchange_price) as supply_exchange_price
        , coalesce(op.borrow_exchange_price, l.borrow_exchange_price) as borrow_exchange_price
    from liquidity_log_operate_events as op
    left join exchange_rates_by_time as l on op.token = l.token and op.block_time = l.block_time
    left join lending_rates_by_time as e on op.token = e.token and op.block_time = e.block_time
)

-- Add prev/next for interpolation
, liquidity_operate_with_neighbors as (
    select
          *
        , lag(supply_exchange_price, 1) ignore nulls over (partition by token order by block_time) as supply_exchange_price_prev
        , lead(supply_exchange_price, 1) ignore nulls over (partition by token order by block_time) as supply_exchange_price_next
        , lag(borrow_exchange_price, 1) ignore nulls over (partition by token order by block_time) as borrow_exchange_price_prev
        , lead(borrow_exchange_price, 1) ignore nulls over (partition by token order by block_time) as borrow_exchange_price_next
        , lag(block_time, 1) ignore nulls over (partition by token order by block_time) as block_time_prev
        , lead(block_time, 1) ignore nulls over (partition by token order by block_time) as block_time_next
    from liquidity_operate_with_rates
)

-- Interpolate missing rates
, juplend_liquidity_operate as (
    select
          t.block_date
        , t.block_slot
        , p.protocol_type
        , t.token
        , t.supply_amount
        , t.borrow_amount
        , t.supply_amount_raw
        , t.borrow_amount_raw
        , coalesce(t.supply_exchange_price,
            case
                when supply_exchange_price_next is null then supply_exchange_price_prev
                when supply_exchange_price_prev is null then bigint '1000000000000'
                else cast(supply_exchange_price_prev + (supply_exchange_price_next - supply_exchange_price_prev) 
                    * cast(date_diff('second', block_time_prev, block_time) as double) 
                    / nullif(cast(date_diff('second', block_time_prev, block_time_next) as double), 0) as bigint)
            end) as supply_exchange_price_final
        , coalesce(t.borrow_exchange_price,
            case
                when borrow_exchange_price_next is null then borrow_exchange_price_prev
                when borrow_exchange_price_prev is null then bigint '1000000000000'
                else cast(borrow_exchange_price_prev + (borrow_exchange_price_next - borrow_exchange_price_prev) 
                    * cast(date_diff('second', block_time_prev, block_time) as double) 
                    / nullif(cast(date_diff('second', block_time_prev, block_time_next) as double), 0) as bigint)
            end) as borrow_exchange_price_final
    from liquidity_operate_with_neighbors as t
    left join (select distinct protocol, protocol_type from juplend_protocols) as p on t.user = p.protocol
)

-- Daily liquidity balance from vault
, juplend_daily_liquidity_balance as (
    select b.day, t.mint, t.vault, b.token_balance as balance
    from juplend_liquidity_tokens as t
    inner join solana_utils.daily_balances b on b.address = t.vault and b.month >= timestamp '2025-07-01'
)

-- Fill gaps in daily balances
, juplend_daily_liquidity_balance_rolling as (
    select day, mint, coalesce(balance, lag(balance, 1) ignore nulls over (partition by vault order by day)) as balance
    from (
        select t.day, tt.mint, tt.vault, l.balance
        from timeline as t
        cross join (select distinct mint, vault from juplend_liquidity_tokens) as tt
        left join juplend_daily_liquidity_balance as l on l.vault = tt.vault and l.day = t.day
    )
)

-- Daily aggregated operate data (per protocol_type and token)
, daily_operate_agg as (
    select 
          block_date as day
        , protocol_type
        , token
        , sum(supply_amount_raw) as net_supplied_raw
        , sum(abs(borrow_amount_raw)) filter (where borrow_amount < 0) as repays_raw
        , sum(borrow_amount_raw) as net_borrowed_raw
        , max(supply_exchange_price_final) as supply_exchange_price
        , max(borrow_exchange_price_final) as borrow_exchange_price
    from juplend_liquidity_operate
    where block_slot <= (select max(block_slot) from solana_utils.daily_balances)
    group by 1, 2, 3
)

-- Daily exchange rates (carry forward)
, juplend_daily_exchange_rate as (
    select
          t.day
        , pt.mint
        , max(coalesce(l.supply_exchange_price, bigint '1000000000000')) over (partition by pt.mint order by t.day) as supply_exchange_price
        , max(coalesce(l.borrow_exchange_price, bigint '1000000000000')) over (partition by pt.mint order by t.day) as borrow_exchange_price
    from timeline as t
    inner join juplend_liquidity_tokens as pt on t.day >= pt.block_date
    left join (
        select block_date, token, max(supply_exchange_price_final) as supply_exchange_price, max(borrow_exchange_price_final) as borrow_exchange_price
        from juplend_liquidity_operate
        group by 1, 2
    ) as l on l.block_date = t.day and l.token = pt.mint
)

-- Cumulative positions per protocol_type and token (step 1: compute cumulative sums)
, daily_cumulative_positions_base as (
    select
          t.day
        , pt.protocol_type
        , pt.mint
        , l.net_supplied_raw
        , l.net_borrowed_raw
        , l.repays_raw
        , sum(coalesce(l.net_supplied_raw, 0)) over (partition by pt.mint, pt.protocol_type order by t.day) as cum_net_deposits_raw
        , sum(coalesce(l.net_borrowed_raw, 0)) over (partition by pt.mint, pt.protocol_type order by t.day) as cum_net_borrowed_raw
        , r.supply_exchange_price
        , r.borrow_exchange_price
    from timeline as t
    inner join juplend_protocol_tokens as pt on t.day >= pt.block_date
    left join daily_operate_agg as l 
        on t.day = l.day 
        and pt.protocol_type = l.protocol_type 
        and pt.mint = l.token
    left join juplend_daily_exchange_rate as r on t.day = r.day and pt.mint = r.mint
)

-- Step 2: add lagged values for fee calculation
, daily_cumulative_positions_by_type as (
    select
          *
        -- Get previous day's exchange rates for fee calculation
        , lag(supply_exchange_price, 1) over (partition by mint order by day) as prev_supply_exchange_price
        , lag(borrow_exchange_price, 1) over (partition by mint order by day) as prev_borrow_exchange_price
        -- Get previous day's cumulative positions for fee calculation (use average TVL)
        , lag(cum_net_borrowed_raw, 1) over (partition by mint, protocol_type order by day) as prev_cum_net_borrowed_raw
        , lag(cum_net_deposits_raw, 1) over (partition by mint, protocol_type order by day) as prev_cum_net_deposits_raw
    from daily_cumulative_positions_base
)

-- TVL with pricing per protocol_type
, daily_tvl_by_type as (
    select
          op.day
        , op.protocol_type
        , op.mint
        , coalesce(mp.symbol, p.symbol) as symbol
        , p.price
        , coalesce(mp.decimals, p.decimals) as decimals
        , op.cum_net_deposits_raw * (op.supply_exchange_price / 1e12) / pow(10, coalesce(mp.decimals, p.decimals)) as total_supplied
        , op.cum_net_borrowed_raw * (op.borrow_exchange_price / 1e12) / pow(10, coalesce(mp.decimals, p.decimals)) as total_borrowed
        , (op.cum_net_deposits_raw * (op.supply_exchange_price / 1e12) - op.cum_net_borrowed_raw * (op.borrow_exchange_price / 1e12)) / pow(10, coalesce(mp.decimals, p.decimals)) as total_available
        , op.cum_net_deposits_raw * (op.supply_exchange_price / 1e12) * p.price / pow(10, coalesce(mp.decimals, p.decimals)) as total_supplied_usd
        , op.cum_net_borrowed_raw * (op.borrow_exchange_price / 1e12) * p.price / pow(10, coalesce(mp.decimals, p.decimals)) as total_borrowed_usd
        , coalesce(op.repays_raw, 0) * (op.borrow_exchange_price / 1e12) * p.price / pow(10, coalesce(mp.decimals, p.decimals)) as repays_usd
        , (op.cum_net_deposits_raw * (op.supply_exchange_price / 1e12) - op.cum_net_borrowed_raw * (op.borrow_exchange_price / 1e12)) * p.price / pow(10, coalesce(mp.decimals, p.decimals)) as total_available_usd
        -- daily_fees = (today_borrow_rate - yesterday_borrow_rate) / 1e12 * avg(yesterday_borrowed, today_borrowed) * price
        -- This represents interest paid by borrowers during the day
        , case 
            when op.prev_borrow_exchange_price is not null and op.borrow_exchange_price > op.prev_borrow_exchange_price
            then ((op.borrow_exchange_price - op.prev_borrow_exchange_price) / 1e12) 
                * ((coalesce(op.prev_cum_net_borrowed_raw, 0) + op.cum_net_borrowed_raw) / 2.0) 
                * p.price / pow(10, coalesce(mp.decimals, p.decimals))
            else 0
          end as daily_fees_usd
        -- daily_supply_side_revenue = (today_supply_rate - yesterday_supply_rate) / 1e12 * avg(yesterday_supplied, today_supplied) * price
        -- This represents interest earned by suppliers during the day
        , case 
            when op.prev_supply_exchange_price is not null and op.supply_exchange_price > op.prev_supply_exchange_price
            then ((op.supply_exchange_price - op.prev_supply_exchange_price) / 1e12) 
                * ((coalesce(op.prev_cum_net_deposits_raw, 0) + op.cum_net_deposits_raw) / 2.0) 
                * p.price / pow(10, coalesce(mp.decimals, p.decimals))
            else 0
          end as daily_supply_side_revenue_usd
    from daily_cumulative_positions_by_type as op
    left join manual_pricing as mp on from_base58(op.mint) = mp.token and mp.blockchain = 'solana'
    left join prices.day as p
        on p.contract_address = coalesce(mp.price_token, from_base58(op.mint))
        and p.blockchain = coalesce(mp.price_blockchain, 'solana')
        and p.timestamp = op.day
)

-- Aggregate by mint (across protocol types)
, daily_tvl_by_token_agg as (
    select
          day
        , mint
        , symbol
        , avg(price) as price
        , max(decimals) as decimals
        , sum(total_supplied_usd) filter (where protocol_type = 'lending') as lending_supplied_usd
        , sum(total_supplied_usd) filter (where protocol_type = 'vault') as vault_supplied_usd
        , sum(total_borrowed_usd) filter (where protocol_type = 'vault') as vault_borrowed_usd
        , sum(repays_usd) filter (where protocol_type = 'flashloan') as flashloan_repays_usd
        , sum(total_supplied_usd) filter (where protocol_type = 'other') as other_supplied_usd
        , sum(total_borrowed_usd) filter (where protocol_type = 'other') as other_borrowed_usd
        , sum(total_supplied_usd) as total_supplied_usd
        , sum(total_borrowed_usd) as total_borrowed_usd
        , sum(total_available_usd) as total_available_usd
        , sum(total_supplied) as total_supplied
        , sum(total_borrowed) as total_borrowed
        , sum(total_available) as total_available
        , sum(daily_fees_usd) as daily_fees_usd
        , sum(daily_supply_side_revenue_usd) as daily_supply_side_revenue_usd
    from daily_tvl_by_type
    group by 1, 2, 3
)

-- Join with liquidity balance for revenue calculation
, daily_tvl_with_balance as (
    select
          op.day
        , op.mint
        , op.symbol
        , op.price
        , op.decimals
        , op.total_supplied_usd
        , op.total_borrowed_usd
        , op.total_available
        , op.daily_fees_usd
        , op.daily_supply_side_revenue_usd
        , b.balance as liquidity_balance
        , b.balance * op.price as liquidity_balance_usd
        , b.balance - op.total_available as reserves
        , b.balance * op.price - op.total_available_usd as reserves_usd
        , (b.balance - op.total_available) - coalesce(lag(b.balance - op.total_available, 1) over (partition by op.mint order by op.day), 0) as day_revenue
        , ((b.balance - op.total_available) - coalesce(lag(b.balance - op.total_available, 1) over (partition by op.mint order by op.day), 0)) * op.price as day_revenue_usd
    from daily_tvl_by_token_agg as op
    left join juplend_daily_liquidity_balance_rolling as b on b.day = op.day and b.mint = op.mint
)

-- Aggregate daily metrics
select
      day
    , sum(total_supplied_usd) as daily_supply_tvl_usd
    , sum(total_borrowed_usd) as daily_borrow_tvl_usd
    , sum(coalesce(daily_fees_usd, 0)) as daily_fees_usd
    , sum(coalesce(daily_supply_side_revenue_usd, 0)) as daily_supply_side_revenue_usd
    , sum(coalesce(day_revenue_usd, 0)) as daily_revenue_usd
from daily_tvl_with_balance
where day >= FROM_UNIXTIME({{start}})
    and day < FROM_UNIXTIME({{end}})
    and decimals is not null 
    and price is not null
group by 1
order by day desc
