with pools as (
    select
        chain,
        pool,
        asset0,
        asset1
    from eulerswap_multichain.eulerswapfactory_uniswapv4_evt_pooldeployed
),
config as (
    select
        evt_block_time,
        chain,
        pool,
        cast(json_extract_scalar(params, '$.fee') as double) / power(10, 18) as fee,
        cast(json_extract_scalar(params, '$.protocolFee') as double) / power(10, 18) as protocolFee,
        (cast(json_extract_scalar(params, '$.fee') as double) - cast(json_extract_scalar(params, '$.protocolFee') as double)) / power(10, 18) as lpFee
    from eulerswap_multichain.eulerswapfactory_uniswapv4_evt_poolconfig
),
prices as (
    select
        date_trunc('hour', minute) as time,
        blockchain,
        contract_address,
        decimals,
        avg(price) as price
        from prices.usd
    where blockchain in (select distinct chain from pools)
        and contract_address in (
            select distinct asset0 from pools union all select distinct asset1 from pools
        )
    group by 1, 2, 3, 4
),
swap_events as (
    select
        evt_block_time,
        chain,
        contract_address as pool,
        cast(amount0in as double) as asset0_amount_in,
        cast(amount1in as double) as asset1_amount_in,
        evt_tx_hash,
        evt_index
    from eulerswap_multichain.eulerswap_evt_swap
    where evt_block_time >= from_unixtime({{start}})
        and evt_block_time < from_unixtime({{end}})
        and chain != 'unichain'

    union all

    select
        evt_block_time,
        'unichain' as chain,
        contract_address as pool,
        cast(amount0in as double) as asset0_amount_in,
        cast(amount1in as double) as asset1_amount_in,
        evt_tx_hash,
        evt_index
    from eulerswap_unichain.eulerswapinstance_evt_swap
    where evt_block_time >= from_unixtime({{start}})
        and evt_block_time < from_unixtime({{end}})
),
raw_swaps as (
    select
        s.evt_block_time,
        s.chain,
        s.pool,
        s.asset0_amount_in,
        s.asset1_amount_in,
        config.fee,
        config.protocolfee,
        config.lpfee,
        row_number() over (partition by s.chain, s.pool, s.evt_tx_hash, s.evt_index order by config.evt_block_time desc) as rn
    from swap_events s
    left join config
        on s.chain = config.chain
        and s.pool = config.pool
        and s.evt_block_time >= config.evt_block_time
),
swaps as (
    select
        raw_swaps.evt_block_time,
        raw_swaps.pool,
        raw_swaps.chain,
        case when asset0_amount_in = 0 then p1.price * asset1_amount_in / power(10, p1.decimals) else p0.price * asset0_amount_in / power(10, p0.decimals) end / (1 - fee) as amount_in_usd,
        fee,
        protocolfee,
        lpfee
    from raw_swaps
    left join pools
        on raw_swaps.chain = pools.chain
        and raw_swaps.pool = pools.pool
    left join prices p0
        on pools.chain = p0.blockchain
        and date_trunc('hour', raw_swaps.evt_block_time) = p0.time
        and pools.asset0 = p0.contract_address
    left join prices p1
        on pools.chain = p1.blockchain
        and date_trunc('hour', raw_swaps.evt_block_time) = p1.time
        and pools.asset1 = p1.contract_address
    where rn = 1
)
select
    chain,
    SUM(amount_in_usd * (1 - fee)) as volume,
    SUM(amount_in_usd * protocolfee) as dailyProtocolFees,
    SUM(amount_in_usd * lpfee) as dailySupplySideRevenue
from swaps
where pool not in (
        0x09922e1c707a3e0748c883e6a87efb38e02168a8, 
        0x3f4f9b467e882594548cce8b3edfe45dee3ce8a8, 
        0xeaa6b017c5217103bcf567826e1928bfdca328a8
    )
    AND evt_block_time >= from_unixtime({{start}})
    AND evt_block_time < from_unixtime({{end}})
GROUP BY chain