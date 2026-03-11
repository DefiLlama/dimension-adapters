with

timeline as (
    select timestamp as day
    from utils.days
    where timestamp >= timestamp '2025-07-25'
        and timestamp < FROM_UNIXTIME({{end}})
)

-- Manual pricing overrides for tokens without standard price feeds
, manual_pricing as (
    select * from "query_5169345"
)

-- Get protocol types (lending/vault/flashloan/other) for each protocol address
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
    left join jupiter_solana.lending_call_init_lending as l
        on p.protocol = l.account_lending
    left join jupiter_solana.vaults_call_init_vault_config as v
        on p.protocol = v.account_vault_config
    left join jupiter_solana.flashloan_call_init_flashloan_admin as f
        on p.protocol = f.account_flashloan_admin
)

-- Get unique tokens per protocol type with their start date
, juplend_protocol_tokens as (
    select protocol_type, mint, min(block_date) as block_date
    from (
        select protocol_type, supply_mint as mint, block_date from juplend_protocols
        union
        select protocol_type, borrow_mint as mint, block_date from juplend_protocols
    )
    group by 1, 2
)

-- Get vault addresses and decimals for each token
, juplend_liquidity_tokens as (
    select 
          i.account_mint as mint
        , i.account_vault as vault
        , t.decimals
    from jupiter_solana.liquidity_call_init_token_reserve as i
    left join tokens_solana.fungible as t
        on i.account_mint = t.token_mint_address
)

-- Parse exchange rates from LogOperate events in liquidity_call_operate logs
, liquidity_log_operate_events as (
    select
          block_time
        , date_trunc('day', block_time) as day
        , to_base58(varbinary_substring(program_data, 41, 32)) as token
        , varbinary_to_bigint(varbinary_reverse(varbinary_substring(program_data, 169, 8))) as supply_exchange_price
        , varbinary_to_bigint(varbinary_reverse(varbinary_substring(program_data, 177, 8))) as borrow_exchange_price        
    from (
        select
              block_time
            , try(from_base64(split(log_messages.logs, ' ')[3])) as program_data
            , varbinary_length(try(from_base64(split(log_messages.logs, ' ')[3]))) as program_data_len
        from (
            select
                  call_block_time as block_time
                , call_log_messages as log_messages
                , row_number() over (partition by call_tx_id order by call_outer_instruction_index asc) as rn
            from jupiter_solana.liquidity_call_operate
            where call_block_time < FROM_UNIXTIME({{end}})
        )
        left join unnest(log_messages) with ordinality as log_messages(logs, log_index) on true
        where rn = 1
            and log_messages.logs like '%Program data:%'
            and try(from_base64(split(logs, ' ')[3])) is not null
            and varbinary_substring(from_base64(split(logs, ' ')[3]), 1, 8) = 0xb40851471384ad08
    )
    where program_data_len = 184
)

-- Parse exchange rates from LogUpdateRates events (fallback for missing rates)
, lending_update_rate_events as (
    select
          block_time
        , date_trunc('day', block_time) as day
        , token
        , varbinary_to_bigint(varbinary_reverse(varbinary_substring(program_data, 17, 8))) as liquidity_exchange_price        
    from (
        select
              block_time
            , token
            , try(from_base64(split(log_messages.logs, ' ')[3])) as program_data
        from (
            select
                  call_block_time as block_time
                , account_mint as token
                , call_log_messages as log_messages
                , row_number() over (partition by call_tx_id order by call_outer_instruction_index asc) as rn
            from jupiter_solana.lending_call_update_rate
            where call_block_time < FROM_UNIXTIME({{end}})
        )
        left join unnest(log_messages) with ordinality as log_messages(logs, log_index) on true
        where rn = 1
            and log_messages.logs like '%Program data:%'
            and try(from_base64(split(logs, ' ')[3])) is not null
            and varbinary_substring(from_base64(split(logs, ' ')[3]), 1, 8) = 0xde0b713c930f44d9
    )
)

-- Build juplend_liquidity_operate logic inline (replaces query_6365942)
, juplend_liquidity_operate as (
    select
          t.block_time
        , t.block_date
        , t.block_slot
        , p.protocol_type
        , t.token
        , supply_amount_raw
        , borrow_amount_raw
        , supply_exchange_price
        , borrow_exchange_price
    from (
        select
              *
            , lag(supply_exchange_price, 1) ignore nulls over (partition by token order by block_time asc) as supply_exchange_price_prev
            , lag(borrow_exchange_price, 1) ignore nulls over (partition by token order by block_time asc) as borrow_exchange_price_prev
            , lead(supply_exchange_price, 1) ignore nulls over (partition by token order by block_time asc) as supply_exchange_price_next
            , lead(borrow_exchange_price, 1) ignore nulls over (partition by token order by block_time asc) as borrow_exchange_price_next
            , lag(block_time, 1) ignore nulls over (partition by token order by block_time asc) as block_time_prev
            , lead(block_time, 1) ignore nulls over (partition by token order by block_time asc) as block_time_next
        from (
            select
                  op.call_block_time as block_time
                , op.call_block_date as block_date
                , op.call_block_slot as block_slot
                , op.account_protocol as user
                , op.account_mint as token
                , op.supply_amount / (
                    case
                        when l.supply_exchange_price is not null then l.supply_exchange_price
                        when e.liquidity_exchange_price is not null then e.liquidity_exchange_price
                        else bigint '1000000000000'
                    end / 1e12 ) as supply_amount_raw
                , op.borrow_amount / (
                    case
                        when l.borrow_exchange_price is not null then l.borrow_exchange_price
                        else bigint '1000000000000'
                    end / 1e12 ) as borrow_amount_raw
                , coalesce(l.supply_exchange_price, e.liquidity_exchange_price) as supply_exchange_price
                , l.borrow_exchange_price
            from jupiter_solana.liquidity_call_operate as op
            left join (
                    select token, block_time, max(supply_exchange_price) as supply_exchange_price, max(borrow_exchange_price) as borrow_exchange_price
                    from liquidity_log_operate_events
                    group by 1, 2) as l
                on op.account_mint = l.token and op.call_block_time = l.block_time
            left join (
                    select token, block_time, max(liquidity_exchange_price) as liquidity_exchange_price
                    from lending_update_rate_events
                    group by 1, 2) as e
                on op.account_mint = e.token and op.call_block_time = e.block_time
            where op.call_block_time < FROM_UNIXTIME({{end}})
        )
    ) as t
    left join (select distinct protocol, protocol_type from juplend_protocols) as p
        on t.user = p.protocol
)

-- Calculate daily positions with cumulative supply/borrow and exchange rates
, daily_positions as (
    select
          op.day
        , op.mint
        , coalesce(mp.symbol, p.symbol) as symbol
        , p.price
        , coalesce(mp.decimals, p.decimals) as decimals
        , op.cum_net_deposits_raw
        , op.cum_net_borrowed_raw
        , op.supply_exchange_price
        , op.borrow_exchange_price
        -- Total supplied in human readable units
        , op.cum_net_deposits_raw * (op.supply_exchange_price / 1e12) / pow(10, coalesce(mp.decimals, p.decimals)) as total_supplied
        -- Total borrowed in human readable units  
        , op.cum_net_borrowed_raw * (op.borrow_exchange_price / 1e12) / pow(10, coalesce(mp.decimals, p.decimals)) as total_borrowed
        -- Total supplied in USD
        , op.cum_net_deposits_raw * (op.supply_exchange_price / 1e12) * p.price / pow(10, coalesce(mp.decimals, p.decimals)) as total_supplied_usd
        -- Total borrowed in USD
        , op.cum_net_borrowed_raw * (op.borrow_exchange_price / 1e12) * p.price / pow(10, coalesce(mp.decimals, p.decimals)) as total_borrowed_usd
    from (
        select
              t.day
            , pt.mint
            , sum(coalesce(l.net_supplied_raw, 0)) over (partition by pt.mint order by t.day asc) as cum_net_deposits_raw
            , sum(coalesce(l.net_borrowed_raw, 0)) over (partition by pt.mint order by t.day asc) as cum_net_borrowed_raw
            , max(coalesce(l.supply_exchange_price, 0)) over (partition by pt.mint order by t.day) as supply_exchange_price
            , max(coalesce(l.borrow_exchange_price, 0)) over (partition by pt.mint order by t.day) as borrow_exchange_price
        from timeline as t
        inner join (select distinct mint, min(block_date) as block_date from juplend_protocol_tokens group by 1) as pt
            on t.day >= pt.block_date
        left join (
                select
                      block_date as day
                    , token
                    , sum(supply_amount_raw) as net_supplied_raw
                    , sum(borrow_amount_raw) as net_borrowed_raw
                    , max(supply_exchange_price) as supply_exchange_price
                    , max(borrow_exchange_price) as borrow_exchange_price
                from juplend_liquidity_operate
                where block_slot <= (select max(block_slot) from solana_utils.daily_balances)
                group by 1, 2 ) as l
            on t.day = l.day and pt.mint = l.token
    ) as op
    left join manual_pricing as mp
        on from_base58(op.mint) = mp.token and mp.blockchain = 'solana'
    left join prices.day as p
        on p.contract_address = coalesce(mp.price_token, from_base58(op.mint))
            and p.blockchain = coalesce(mp.price_blockchain, 'solana')
            and p.timestamp = op.day
)

-- Calculate daily yield based on rate changes
, daily_yield as (
    select
          day
        , mint
        , symbol
        , price
        , decimals
        , total_supplied
        , total_borrowed
        , total_supplied_usd
        , total_borrowed_usd
        , supply_exchange_price
        , borrow_exchange_price
        -- Previous day exchange rates
        , lag(supply_exchange_price, 1) over (partition by mint order by day) as prev_supply_exchange_price
        , lag(borrow_exchange_price, 1) over (partition by mint order by day) as prev_borrow_exchange_price
        -- Previous day positions
        , lag(cum_net_deposits_raw, 1) over (partition by mint order by day) as prev_cum_net_deposits_raw
        , lag(cum_net_borrowed_raw, 1) over (partition by mint order by day) as prev_cum_net_borrowed_raw
        , cum_net_deposits_raw
        , cum_net_borrowed_raw
    from daily_positions
    where decimals is not null and price is not null
)

-- Calculate fees using previous day TVL * rate change
, daily_fees_calc as (
    select
          day
        , mint
        , symbol
        , price
        , decimals
        , total_supplied
        , total_borrowed
        , total_supplied_usd
        , total_borrowed_usd
        -- dailyFees = prev_borrowed_tvl * borrow_rate_change (yield paid by borrowers)
        , case 
            when prev_borrow_exchange_price is not null and prev_borrow_exchange_price > 0
            then prev_cum_net_borrowed_raw * ((borrow_exchange_price - prev_borrow_exchange_price) / 1e12) / pow(10, decimals)
            else 0
          end as daily_fees
        -- dailySupplySideRevenue = prev_supplied_tvl * supply_rate_change (yield paid to suppliers)
        , case 
            when prev_supply_exchange_price is not null and prev_supply_exchange_price > 0
            then prev_cum_net_deposits_raw * ((supply_exchange_price - prev_supply_exchange_price) / 1e12) / pow(10, decimals)
            else 0
          end as daily_supply_side_revenue
    from daily_yield
)

-- Aggregate daily metrics to USD
select
      day
    , sum(total_supplied_usd) as daily_supply_tvl_usd
    , sum(total_borrowed_usd) as daily_borrow_tvl_usd
    , sum(daily_fees * price) as daily_fees_usd
    , sum(daily_supply_side_revenue * price) as daily_supply_side_revenue_usd
    , sum(daily_fees * price) - sum(daily_supply_side_revenue * price) as daily_revenue_usd
from daily_fees_calc
where day >= FROM_UNIXTIME({{start}})
    and day < FROM_UNIXTIME({{end}})
group by 1
order by day desc
