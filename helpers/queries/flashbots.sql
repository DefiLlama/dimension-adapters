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
        where
            (
                block_date between date('2020-01-01') and date(now())
            )
            and (date between date('2020-01-01') and date(now()))
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
            and (
                block_date between date('2020-01-01') and date(now())
            )
            and ("date" between date('2020-01-01') and date(now()))
            -- and (blockdate between date('2020-01-01') and date(now()))
            -- group by 1
    ),
    block_wo_eob_payment as ( -- need to sum up the cb transfer in traces
        select
            t.block_date,
            t.block_number,
            sum(value/1e18) as coinbase_transfer
        from
            ethereum.traces t
            join ethereum.blocks b on t.block_number=b.number
            left join block_with_eob_payment bw on bw.block_number=b.number
        where
            bw.block_number is null -- not in the blocks above
            and to=b.miner
            and success=true -- make sure the trace was successful 
            and (
                t.block_date between date('2020-01-01') and date(now())
            )
            and ("date" between date('2020-01-01') and date(now()))
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
    eth_staked AS (
        select
            time as day,
            sum(sum(daily)) over (
                order by
                    time
            ) as current_staked
        from
            (
                SELECT
                    date_trunc('day', block_time) as time,
                    SUM(amount_staked) AS daily
                FROM
                    staking_ethereum.deposits
                group by
                    1
                union all
                select
                    date_trunc('day', block_time) as day,
                    count(distinct validator_index)*-1*32 AS daily
                from
                    ethereum.withdrawals
                where
                    cast(amount as double)>10*1e9
                group by
                    1
            ) a
        group by
            1
    ),
    validators as (
        select
            day,
            round(current_staked/32, 0) as validators
        from
            eth_staked
    ),
    daily_block_reward AS (
        SELECT DISTINCT
            date_trunc('day', time) AS day,
            SUM(
                CASE
                    WHEN number=1 THEN 72009990.49947989+5 -- Initial supply from table balances_ethereum.genesis_balances plus inital block reward
                    WHEN number>1
                    AND number<4370000 THEN 5 --block reward till byazntium upgrade
                    WHEN number>=4370000
                    AND number<7280000 THEN 3 -- byzantium upgrad which reduced 5 block rewards down to 3
                    WHEN number>=7280000
                    AND number<15537393 THEN 2 -- pre-merge reward
                    ELSE 0
                END
            ) AS block_rewards
        FROM
            ethereum.blocks
        GROUP BY
            1
    ),
    daily_burn AS (
        SELECT
            date_trunc('day', time) AS day,
            SUM(
                CASE
                    WHEN number>=12965000 THEN gas_used*base_fee_per_gas/1e18
                    ELSE 0
                END
            ) AS burn --london fork, formula of burn from alchemy
        FROM
            ethereum.blocks
        GROUP BY
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
        where
            date(time)>=date('2021-08-05')
        group by
            1
    ),
    mev as (
        select
            day,
            mev_reward
        from
            eod_builder_payments
        where
            date(day)>=date('2021-08-05')
    ),
    -- Post merge issuance formula from Ben Edgington via eth2book (https://eth2book.info/bellatrix/part2/incentives/issuance/#overall-issuance)
    -- Methodology from @Dataalways
    daily_rewards_with_staking AS (
        SELECT
            a.day,
            burn AS daily_burn,
            CASE
                WHEN date(a.day)<date('2020-12-01') THEN block_rewards+1243 --uncle reward
                WHEN date(a.day)>=date('2020-12-01')
                AND date(a.day)<date('2022-09-15') THEN (940.8659/365*sqrt(validators))+1243+block_rewards -- staking + uncle rewards
                ELSE block_rewards+(940.8659/365*sqrt(validators)) -- staking rewards
            END AS daily_block_rewards,
            CASE
                WHEN date(a.day)<date('2020-12-01') THEN 0
                else 29.4021/sqrt(floor(validators))
            end AS consensus_apr,
            mev_reward,
            priority_fee_reward
        FROM
            daily_block_reward a
            LEFT JOIN daily_burn b ON a.day=b.day
            left join validators c on a.day=c.day
            left join priority_fee d on a.day=d.day
            left join mev e on a.day=e.day
    ),
    circulating_supply AS (
        SELECT
            day,
            daily_block_rewards as daily_issuance,
            daily_burn,
            consensus_apr,
            priority_fee_reward,
            mev_reward,
            SUM(daily_block_rewards-daily_burn) OVER (
                ORDER BY
                    day
            ) AS cir_supply
        FROM
            daily_rewards_with_staking
    ),
    price as (
        select
            date_trunc('day', minute) as day,
            avg(price) as price
        from
            prices.usd
        where
            contract_address is null
            and symbol='ETH'
            AND minute>=date('2020-11-03')
        group by
            1
    ),
    eth_staking_ratio_and_beacon_chain_balance AS (
        SELECT
            *,
            AVG(total_apy) OVER (
                ORDER BY
                    day ROWS BETWEEN 6 PRECEDING
                    AND CURRENT ROW
            ) AS total_apy_7ma,
            AVG(total_apy) OVER (
                ORDER BY
                    day ROWS BETWEEN 6 PRECEDING
                    AND CURRENT ROW
            )*100 AS total_apy_7ma_percent,
            AVG(fee_apy) OVER (
                ORDER BY
                    day ROWS BETWEEN 6 PRECEDING
                    AND CURRENT ROW
            ) AS fee_apy_7ma,
            AVG(consensus_apy) OVER (
                ORDER BY
                    day ROWS BETWEEN 6 PRECEDING
                    AND CURRENT ROW
            ) AS consensus_apy_7ma,
            AVG(mev_apy) OVER (
                ORDER BY
                    day ROWS BETWEEN 6 PRECEDING
                    AND CURRENT ROW
            ) AS mev_apy_7ma
        FROM
            (
                SELECT
                    a.day,
                    cir_supply,
                    current_staked,
                    floor(current_staked/32) as validators,
                    current_staked*price as staked_usd,
                    cir_supply-current_staked as non_staked,
                    (current_staked/cir_supply)*100 AS stake_ratio,
                    (current_staked/cir_supply) AS staking_ratio_raw,
                    case
                        when consensus_apr=0 then null
                        else consensus_apr
                    end as consensus_apy,
                    daily_issuance,
                    daily_issuance*price as daily_issuance_usd,
                    priority_fee_reward,
                    mev_reward,
                    (mev_reward)/lag(current_staked, 1) over (
                        order by
                            a.day
                    )*365 as mev_apy,
                    (priority_fee_reward)/lag(current_staked, 1) over (
                        order by
                            a.day
                    )*365 as fee_apy,
                    (priority_fee_reward)/lag(current_staked, 1) over (
                        order by
                            a.day
                    )*365+(mev_reward)/lag(current_staked, 1) over (
                        order by
                            a.day
                    )*365+consensus_apr as total_apy
                FROM
                    circulating_supply a
                    left join eth_staked b ON a.day=b.day
                    left join price c on a.day=c.day
            ) a
        where
            date(day)>=date('2022-09-15')
        order by
            1 desc
    )
select
    day,
    sum(sum(priority_fee_reward+mev_reward)) over (
        partition by
            1
        order by
            day
    ) as cum_proposer_revenue
from
    eth_staking_ratio_and_beacon_chain_balance
where
    day>=from_unixtime({{start}})
    and day<from_unixtime({{end}})
group by
    1