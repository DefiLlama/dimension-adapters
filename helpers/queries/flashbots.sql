with
    tx_ct as (
        select
            block_number,
            block_time,
            count(*) as ct,
            SUM((t.gas_used/1e18)*(t.gas_price-base_fee_per_gas)) as gas_pri_fee
        from
            ethereum.transactions t
            join ethereum.blocks b on block_number="number"
            and b."date" >= cast(from_unixtime({{start}}) as date)
            and b."date" < cast(from_unixtime({{end}}) as date)
        where
            TIME_RANGE
        group by
            1,
            2
    ),
    block_with_eob_payment as (
        select
            t.block_number,
            block_date,
            (value/1e18) as eob_transfer_value,
            gas_pri_fee --,
            -- t."from" as builder_address, t."to" as validator_address
        from
            ethereum.blocks b
            join ethereum.transactions t on b.number=t.block_number
            and t.block_date >= cast(from_unixtime({{start}}) as date)
            and t.block_date < cast(from_unixtime({{end}}) as date)
            join tx_ct tc on tc.block_number=b.number
            -- join ethereum.raw_0004 r on r.blocknumber = b.number -- dont need this table if u dont need builder name info
        where
            t."index"=tc.ct - 1
            and (
                t."from"=b.miner
                or t."from" in ( -- ultrasound relay's bid adjustment feature
                    0xa83114A443dA1CecEFC50368531cACE9F37fCCcb, -- beaver
                    0x0AFfB0a96FBefAa97dCe488DfD97512346cf3Ab8, -- rsync
                    0x9FC3da866e7DF3a1c57adE1a97c9f00a70f010c8 -- titan
                )
            )
            and b."date" >= cast(from_unixtime({{start}}) as date)
            and b."date" < cast(from_unixtime({{end}}) as date)
    ),
    block_wo_eob_payment as ( -- need to sum up the cb transfer in traces
        select
            t.block_date,
            t.block_number,
            sum(value/1e18) as coinbase_transfer
        from
            ethereum.traces t
            join ethereum.blocks b on t.block_number=b.number
                and b."date" >= cast(from_unixtime({{start}}) as date)
                and b."date" < cast(from_unixtime({{end}}) as date)
            left join block_with_eob_payment bw on bw.block_number=b.number
        where
            bw.block_number is null -- not in the blocks above
            and to=b.miner
            and success=true -- make sure the trace was successful
            and TIME_RANGE
        group by
            1,
            2
    ),
    total as (
        select
            block_date,
            block_number,
            coinbase_transfer as mev_reward
        from
            block_wo_eob_payment
        union
        select
            block_date,
            block_number,
            eob_transfer_value-gas_pri_fee as mev_reward
        from
            block_with_eob_payment
    ),
    eod_builder_payments as (
        select
            block_date as day,
            sum(mev_reward) as mev_reward
        from
            total
        group by
            1
    ),
    priority_fee as (
        SELECT
            date_trunc('day', block_time) as day,
            SUM(
                cast(a.gas_used as double)*(
                    cast(a.gas_price as double)-cast(base_fee_per_gas as double)
                )/1e18
            ) as priority_fee_reward
        FROM
            ethereum.transactions a
            left join ethereum.blocks b on block_number="number"
                and b."date" >= cast(from_unixtime({{start}}) as date)
                and b."date" < cast(from_unixtime({{end}}) as date)
        where
            TIME_RANGE
        group by
            1
    )
select
    day,
    sum(priority_fee_reward + COALESCE(mev_reward, 0)) as cum_proposer_revenue
from
    priority_fee
    left join eod_builder_payments using (day)
where
    day >= from_unixtime({{start}})
    and day < from_unixtime({{end}})
group by
    1
