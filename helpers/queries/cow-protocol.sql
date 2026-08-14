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
    -- CoW/Beaver MEV Blocker stake sale (CIP-73): quarterly installments through Oct 2028, paid from
    -- 3 payer wallets into the CoW DAO recipient. On-chain total = full sale; adapter splits 50/50 CoW/Beaver.
    select
        date(block_time) as date
        , sum(amount_usd) as mev_blocker_sale_usd
    from tokens_ethereum.transfers
    where to = 0x616dE58c011F8736fa20c7Ae5352F7f6FB9F0669
        and "from" in (
            0xb57f9836bb1d5754c7a1a0c8b05832462ef10761
            , 0xcd531ae9efcce479654c4926dec5f6209531ca7b
            , 0xda12b368a93007ef2446717765917933cebc6080
        )
        and amount_usd > 1000 -- skip ~0.1 ETH test transfers; real installments are $44k+
        and block_time >= (select start_date from day_selector)
        and block_time < date_add('day', 1, (select start_date from day_selector))
    group by 1
)
, mevblocker as (
    select
        coalesce(a.date, b.date) as date
        , a.mev_blocker_fee
        , b.mev_blocker_sale_usd as mev_blocker_sale_usd
    from mevblocker_eth as a
    full outer join mevblocker_sale as b
        on a.date = b.date
    where coalesce(a.date, b.date) = (select start_date from day_selector)
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
        and t.blockchain in ('ethereum', 'gnosis', 'base', 'arbitrum', 'avalanche_c', 'polygon', 'bnb', 'lens')
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
        when f.chain = 'ethereum' then coalesce(m.mev_blocker_sale_usd, 0)
        else 0
    end as mev_blocker_sale_usd
from
    fees_all_chains f
    left join mevblocker m on f.date = m.date and f.chain = 'ethereum'
order by
    f.chain
