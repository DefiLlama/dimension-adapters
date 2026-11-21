-- Sparklend rows: gross_yield_usd is the ALM proxy's share of SparkLend borrower interest BEFORE the reserve factor
-- (alm_supply_amount * utilization * borrow rate, Spark's own formula in https://dune.com/queries/5379492), plus partner
-- rewards on some markets (PYUSD, RLUSD). fees/spark already books the reserve factor on all SparkLend borrower interest
-- as revenue, so take the reserve factor on the interest part out of this adapter's fees and revenue.
-- The rewards carry no reserve factor and stay.
with borrow_rates as (
    select
        t.symbol as token_symbol,
        -- last rate of the day, as in 5379492, ordered by (block, log index): a block can hold several updates
        max_by(e.variableBorrowRate, e.evt_block_number * 100000 + e.evt_index) / 1e27 as borrow_rate
    from spark_protocol_ethereum.pool_evt_reservedataupdated e
    join tokens.erc20 t
        on t.blockchain = 'ethereum'
        and t.contract_address = e.reserve
    where e.evt_block_time >= cast(date '{{dt}}' as timestamp) - interval '7' day
      and e.evt_block_time < cast(date '{{dt}}' as timestamp) + interval '1' day
    group by 1
),
sparklend_reserve_factor as (
    select
        s.token_symbol,
        s.alm_supply_amount * s.price_usd * s.utilization * r.borrow_rate * s.reserve_factor / 365 as reserve_factor_usd
    from dune.sparkdotfi.spark_sparklend_actual_revenue_daily s
    join borrow_rates r
        on r.token_symbol = s.token_symbol
    where s.dt = date '{{dt}}'
      and s.blockchain = 'ethereum'
)
select
    s.dt,
    s.protocol_name,
    s.token_symbol,
    rf.reserve_factor_usd,
    s.revenue_usd - coalesce(rf.reserve_factor_usd, 0) as revenue,
    s.gross_yield_usd - coalesce(rf.reserve_factor_usd, 0) as fees
from dune.sparkdotfi.spark_sll_actual_revenue_daily s
left join sparklend_reserve_factor rf
    on s.protocol_name = 'Sparklend'
    and rf.token_symbol = s.token_symbol
where s.dt = date '{{dt}}'
