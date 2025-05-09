-- kept other two queries dynamic as they update it as new data is added, for example for orders they add it monthly, and they could add excluded orders as well
with
    protocol_fees_per_chain as (
        select
            t.block_time,
            protocol_fee/pow(10, 18)*cast(protocol_fee_native_price as double) as "Total (including ext. Partner Fee)",
            if(
                t.block_number<19564399
                or protocol_fee_kind='surplus',
                protocol_fee-coalesce(partner_fee, 0)
            )/pow(10, 18)*cast(protocol_fee_native_price as double) as "Limit",
            if(
                protocol_fee_kind='priceimprovement',
                protocol_fee-coalesce(partner_fee, 0)
            )/pow(10, 18)*cast(protocol_fee_native_price as double) as "Market",
            if(
                partner_fee_recipient in (0x0000000000000000000000000000000000000000),
                partner_fee/pow(10, 18)*cast(protocol_fee_native_price as double)
            ) as "UI Fee",
            if(
                partner_fee_recipient not in (0x0000000000000000000000000000000000000000),
                -- some partners have custom fee shares
                case partner_fee_recipient
                    when 0x63695eee2c3141bde314c5a6f89b98e62808d716 then 0.1
                    else 0.15
                end*partner_fee/pow(10, 18)*cast(protocol_fee_native_price as double)
            ) as "Partner Fee Share",
            d.app_code,
            t.usd_value,
            t.order_uid,
            t.tx_hash,
            r.solver
        from
            "query_4364122(blockchain='ethereum')" as r
            inner join cow_protocol_ethereum.trades as t on r.order_uid=t.order_uid
            and r.tx_hash=t.tx_hash
            left join dune.cowprotocol.result_cow_protocol_ethereum_app_data as d on t.app_data=d.app_hash
        where
            t.order_uid not in (
                select
                    order_uid
                from
                    query_3639473
            )
        order by
            block_time desc
    ),
    fees_per_chain as (
        select
            date(block_time) as "day",
            sum("Limit") as "Limit",
            sum("Market") as "Market",
            sum("UI Fee") as "UI Fee",
            sum("Partner Fee Share") as "Partner Fee Share"
        from
            protocol_fees_per_chain
        group by
            1
    ),
    daily_revenue_per_chain as (
        select
            day,
            type,
            value
        from
            fees_per_chain
            cross join unnest (
                array['Limit', 'Market', 'UI Fee', 'Partner Fee Share'],
                array["Limit", "Market", "UI Fee", "Partner Fee Share"]
            ) as t (type, value) -- noqa: AL05
        order by
            1 desc
    )
select
    sum(value) as eth_value
from
    daily_revenue_per_chain
where
    day=from_unixtime({{start}})
group by
    day
