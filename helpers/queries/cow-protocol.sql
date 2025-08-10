with 
mevblocker_eth as (
    select
         date(call_block_time) as date
        ,sum(t.due / 1e18 / 2) as mev_blocker_fee
    from mev_blocker_ethereum.MevBlockerFeeTill_call_bill
    cross join unnest(due) as t (due)
    where call_success = true
        and date(call_block_time) = from_unixtime({{start}})
    group by 1
)
, fees_per_chain as (
    select
        date_trunc('day', block_time) as date
        , blockchain as chain
        , sum(protocol_fee_revenue_eth) as protocol_fee_revenue
        , sum(limit_revenue_eth) as limit_revenue
        , sum(market_revenue_eth) as market_revenue
        , sum(ui_fee_revenue_eth) as ui_fee_revenue
        , sum(partner_fee_partner_revenue_eth) as partner_fee_partner_revenue  
        , sum(partner_fee_cow_revenue_eth) as partner_fee_cow_revenue        
    from dune.cowprotocol.result_fees_revenue_per_order as rev
    where 
        date_trunc('day', block_time) = from_unixtime({{start}})
        and blockchain in ('ethereum', 'gnosis', 'base', 'arbitrum', 'avalanche_c', 'polygon')
    group by 1,2
)
select
    f.date,
    f.chain,
    f.protocol_fee_revenue,
    f.limit_revenue,
    f.market_revenue,
    f.ui_fee_revenue,
    f.partner_fee_partner_revenue,
    f.partner_fee_cow_revenue,
    case 
        when f.chain = 'ethereum' then coalesce(m.mev_blocker_fee, 0)
        else 0
    end as mev_blocker_fee
from
    fees_per_chain f
    left join mevblocker_eth m on f.date = m.date and f.chain = 'ethereum'
order by
    f.chain
