-- kept other two queries dynamic as they update it as new data is added, for example for orders they add it monthly, and they could add excluded orders as well
with
    daily_eth_price as (
        select
            day,
            price
        from prices.usd_daily
        where
            blockchain = 'ethereum'
            and contract_address = 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
    ),
    protocol_fees_per_chain as (
        select
            t.block_time,
            'ethereum' as chain,
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
        
        UNION all

        select
            t.block_time,
            'base' as chain,
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
            "query_4364122(blockchain='base')" as r
            inner join cow_protocol_base.trades as t on r.order_uid=t.order_uid
            and r.tx_hash=t.tx_hash
            left join dune.cowprotocol.result_cow_protocol_base_app_data as d on t.app_data=d.app_hash
        where
            t.order_uid not in (
                select
                    order_uid
                from
                    query_3639473
            )

        UNION all

        select
            t.block_time,
            'arbitrum' as chain,
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
                partner_fee_recipient in (0x451100Ffc88884bde4ce87adC8bB6c7Df7fACccd),
                partner_fee/pow(10, 18)*cast(protocol_fee_native_price as double)
            ) as "UI Fee",
            if(
                partner_fee_recipient not in (0x451100Ffc88884bde4ce87adC8bB6c7Df7fACccd),
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
            "query_4364122(blockchain='arbitrum')" as r
            inner join cow_protocol_arbitrum.trades as t on r.order_uid=t.order_uid
            and r.tx_hash=t.tx_hash
            left join dune.cowprotocol.result_cow_protocol_arbitrum_app_data as d on t.app_data=d.app_hash
        where
            t.order_uid not in (
                select
                    order_uid
                from
                    query_3639473
            )

        UNION all

        select
            t.block_time,
            'gnosis' as chain,
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
                partner_fee_recipient in (0x6b3214fD11dc91De14718DeE98Ef59bCbFcfB432),
                partner_fee/pow(10, 18)*cast(protocol_fee_native_price as double)
            ) as "UI Fee",
            if(
                partner_fee_recipient not in (0x6b3214fD11dc91De14718DeE98Ef59bCbFcfB432),
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
            "query_4364122(blockchain='gnosis')" as r
            inner join cow_protocol_gnosis.trades as t on r.order_uid=t.order_uid
            and r.tx_hash=t.tx_hash
            left join dune.cowprotocol.result_cow_protocol_gnosis_app_data as d on t.app_data=d.app_hash
        where
            t.order_uid not in (
                select
                    order_uid
                from
                    query_3639473
            )

    ),
    mevblocker as (
        select
            date(call_block_time) as "day",
            sum(t.due / 1e18 / 2) as mev_blocker_fee
        from mev_blocker_ethereum.MevBlockerFeeTill_call_bill
        cross join unnest(due) as t (due)
        where
            call_success = true
            and date(call_block_time) = from_unixtime({{start}})
        group by 1
    ),
    fees_per_chain as (
        select
            date(p.block_time) as "day",
            p.chain as chain,
            case 
                when p.chain = 'gnosis' then sum("Limit" / coalesce(eth.price, 1))
                else sum("Limit")
            end as "limit",
            case 
                when p.chain = 'gnosis' then sum("Market" / coalesce(eth.price, 1))
                else sum("Market")
            end as "market",
            case 
                when p.chain = 'gnosis' then sum("UI Fee" / coalesce(eth.price, 1))
                else sum("UI Fee")
            end as "ui_fee",
            case 
                when p.chain = 'gnosis' then sum("Partner Fee Share" / coalesce(eth.price, 1))
                else sum("Partner Fee Share")
            end as "partner_fee"
        from
            protocol_fees_per_chain p
            left join daily_eth_price eth on date(p.block_time) = eth.day
        group by
            1, 2
    )
select
    f.day,
    f.chain,
    f.limit,
    f.market, 
    f.ui_fee,
    f.partner_fee,
    case 
        when f.chain = 'ethereum' then coalesce(m.mev_blocker_fee, 0)
        else 0
    end as mev_blocker_fee
from
    fees_per_chain f
    left join mevblocker m on f.day = m.day and f.chain = 'ethereum'
where
    f.day = from_unixtime({{start}})
order by
    f.chain
