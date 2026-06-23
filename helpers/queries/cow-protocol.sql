with 
day_selector as (
    select from_unixtime({{start}}) as start_date
)
, mevblocker_eth as (
    select
         date(call_block_time) as date
        , sum(t.due / 1e18 / 2) as mev_blocker_fee
    from mev_blocker_ethereum.MevBlockerFeeTill_call_bill
    cross join unnest(due) as t (due)
    where call_success = true
        and call_block_time >= (select start_date from day_selector)
        and call_block_time < date_add('day', 1, (select start_date from day_selector))
        and call_block_time < date('2025-11-01')
    group by 1
)
, mevblocker_sale as (
    select *
    from (
        values
        (timestamp '2025-11-04', 0.5*6908146.85, 0.5*6908146.85/3212.33)
        ,(timestamp '2026-01-21', 0.5*44132.69, 0.5*14.9)
        ,(timestamp '2026-02-17', 0.5*169597.29, 0.5*82.7705679057619)
    ) as t(date, mev_blocker_sale_usd, mev_blocker_sale_eth)
)
, mevblocker as (
    select
        coalesce(a.date, date(b.date)) as date
        , a.mev_blocker_fee
        , b.mev_blocker_sale_eth as mev_blocker_sale
    from mevblocker_eth as a
    full outer join mevblocker_sale as b
        on a.date = date(b.date)
    where coalesce(a.date, date(b.date)) = (select start_date from day_selector)
)
, fees_per_chain as (
    select
        date_trunc('day', t.block_time) as date
        , t.blockchain as chain
        , sum(f.protocol_fee_eth) as protocol_fee_revenue
        , sum(f.partner_fee_partner_cut_eth) as partner_fee_partner_revenue
        , sum(f.partner_fee_cow_cut_eth) as partner_fee_cow_revenue
    from dune.cowprotocol.fct_trades as t
    left join dune.cowprotocol.fct_fees as f
        on t.tx_hash = f.tx_hash
        and t.order_uid = f.order_uid
    where
        date_trunc('day', t.block_time) = from_unixtime({{start}})
        and t.blockchain in ('ethereum', 'gnosis', 'base', 'arbitrum', 'avalanche_c', 'polygon', 'lens')
    group by 1, 2
)
, fees_all_chains as (
    select * from fees_per_chain
    union all
    select
        (select start_date from day_selector) as date
        , 'ethereum' as chain
        , 0 as protocol_fee_revenue
        , 0 as partner_fee_partner_revenue
        , 0 as partner_fee_cow_revenue
    from mevblocker m
    where not exists (select 1 from fees_per_chain f where f.chain = 'ethereum')
)
select
    f.date,
    f.chain,
    f.protocol_fee_revenue,
    f.partner_fee_partner_revenue,
    f.partner_fee_cow_revenue,
    case
        when f.chain = 'ethereum' then coalesce(m.mev_blocker_fee, 0)
        else 0
    end as mev_blocker_fee,
    case
        when f.chain = 'ethereum' then coalesce(m.mev_blocker_sale, 0)
        else 0
    end as mev_blocker_sale
from
    fees_all_chains f
    left join mevblocker m on f.date = m.date and f.chain = 'ethereum'
order by
    f.chain
