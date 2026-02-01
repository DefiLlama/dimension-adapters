WITH
    eth_price AS (
        SELECT
            day,
            price
        FROM
            (
                SELECT
                    DATE_TRUNC('day', minute) AS day,
                    price,
                    RANK() OVER (
                        PARTITION BY
                            DATE_TRUNC('day', minute)
                        ORDER BY
                            minute DESC
                    ) AS ra
                FROM
                    prices.usd
                WHERE
                    symbol='ETH'
                    AND contract_address IS NULL
                    AND blockchain IS NULL
                    AND minute>=DATE('2023-06-01')
            ) A
        WHERE
            ra=1
    ),
    vaults as (
        SELECT
            nodeDistributor as ELvaults
        FROM
            stader_ethereum.VaultFactory_evt_NodeELRewardVaultCreated
    ),
    blocks AS (
        SELECT
            number,
            blocks.time,
            blocks.base_fee_per_gas,
            blocks.gas_used,
            blocks.base_fee_per_gas*blocks.gas_used/1e18 AS total_burn
        FROM
            ethereum.blocks
        WHERE
            miner in (
                select
                    ELvaults
                from
                    vaults
            )
    ),
    eth_tx AS (
        SELECT
            block_time,
            block_number,
            gas_used,
            gas_used*gas_price/1e18 AS fee
        FROM
            ethereum.transactions
        WHERE
            block_number IN (
                SELECT DISTINCT
                    number
                FROM
                    blocks
            )
    ),
    eth_tx_agg AS (
        SELECT
            block_number,
            MAX(block_time) AS block_time,
            SUM(gas_used) AS block_gas_used,
            SUM(fee) AS fee
        FROM
            eth_tx
        GROUP BY
            block_number
    ),
    blocks_rewards AS (
        SELECT
            block_number,
            block_time,
            block_gas_used,
            fee-b.total_burn AS block_reward
        FROM
            eth_tx_agg AS t
            LEFT JOIN blocks AS b ON t.block_number=b.number
        ORDER BY
            block_number DESC
    ),
    transfers AS (
        SELECT
            block_time AS time,
            block_number,
            sum(CAST(value AS DOUBLE)/1e18) AS amount
        FROM
            ethereum.traces
        WHERE
            "to" in (
                select
                    ELvaults
                from
                    vaults
            )
            AND (
                NOT LOWER(call_type) IN ('delegatecall', 'callcode', 'staticcall')
                OR call_type IS NULL
            )
            AND tx_success
            AND success
            and CAST(value AS DOUBLE)/1e18>0
        GROUP BY
            1,
            2
    ),
    aggr_data AS (
        SELECT
            block_time,
            block_number,
            block_reward AS amount
        FROM
            blocks_rewards
        UNION
        SELECT
            time as block_time,
            block_number,
            amount
        FROM
            transfers
    ),
    ELrewards as (
        select
            *,
            DATE_TRUNC('day', block_time) day,
            (amount*0.7875) as user_reward,
            (amount*0.1775) as operator_reward,
            (amount*0.035) as stader_reward
        from
            aggr_data
    ),
    el_vaults as (
        select
            day,
            'EL vaults' reward_type,
            'Permissionless' pool_type,
            SUM(user_reward) user_reward,
            SUM(stader_reward) stader_reward,
            SUM(operator_reward) operator_reward
        from
            ELrewards
        group by
            1,
            2,
            3
        order by
            day desc
    ),
    total_data AS (
        SELECT
            'Permissionless' AS pool_type,
            evt_tx_hash AS total_tx
        FROM
            (
                select distinct
                    evt_tx_hash as evt_tx_hash
                from
                    stader_ethereum.PermissionlessNodeRegistry_evt_AddedValidatorKey
            )
        UNION ALL
        SELECT
            'Permissioned' AS pool_type,
            evt_tx_hash AS total_tx
        FROM
            (
                select distinct
                    evt_tx_hash as evt_tx_hash
                from
                    stader_ethereum.PermissionedNodeRegistry_evt_AddedValidatorKey
            )
    ),
    -- CL vaults will fetch the vaults and tag them as permissioned or permissionless using total_data table
    CLvaults as (
        SELECT
            *
        FROM
            stader_ethereum.VaultFactory_evt_WithdrawVaultCreated AS A
            LEFT JOIN total_data AS B on A.evt_tx_hash=B.total_tx
    ),
    beaconchain as (
        select
            block_time,
            DATE_TRUNC('day', block_time) day,
            B.pool_type,
            address,
            cast(amount as double)/1e9 as withdrawn
        from
            ethereum.withdrawals A
            inner join CLvaults B on A.address=B.withdrawVault
            -- where
            --   B.pool_type is not null
    ),
    cl_transfers as (
        select
            block_time,
            day,
            B.pool_type,
            address,
            withdrawn
        from
            (
                select
                    block_time,
                    DATE_TRUNC('day', block_time) day,
                    "to" as address,
                    cast(value as double)/1e18 as withdrawn
                from
                    ethereum.transactions A
                where
                    "to" in (
                        select
                            withdrawVault
                        from
                            CLvaults
                    )
                    and value>0
            ) A
            left join CLvaults B on A.address=B.withdrawVault
    ),
    withdrawals as (
        select
            *
        from
            beaconchain
        union
        select
            *
        from
            cl_transfers
    ),
    wallets as (
        select distinct
            address
        from
            withdrawals
        where
            withdrawn<32
            and withdrawn>=28
    ),
    outgoing as (
        select
            block_time,
            day,
            B.pool_type,
            A.contract_address as address,
            (user+operator+stader) as withdrawn
        from
            (
                SELECT
                    block_time,
                    DATE_TRUNC('day', block_time) AS day,
                    contract_address,
                    (-1)*(bytearray_to_uint256 (substr(data, 1, 32))/1e18) user,
                    (-1)*(bytearray_to_uint256 (substr(data, 33, 32))/1e18) operator,
                    (-1)*(bytearray_to_uint256 (substr(data, 65, 32))/1e18) stader
                FROM
                    ethereum.logs
                where
                    topic0=0x95a31bc3041897ca26d2debdc69c41333fbf5d1cb92040b8d0d35e62c5e01433
                    and contract_address in (
                        select
                            address
                        from
                            wallets
                    )
            ) A
            left join CLvaults B on A.contract_address=B.withdrawVault
    ),
    penalties as (
        select
            *,
            sum(withdrawn) over (
                partition by
                    address
                order by
                    block_time
            ) total,
            rank() over (
                partition by
                    address
                order by
                    block_time desc
            ) rnk
        from
            (
                select
                    *
                from
                    withdrawals
                where
                    address in (
                        select
                            *
                        from
                            wallets
                    )
                union
                select
                    *
                from
                    outgoing
            )
    ),
    penalty_val as (
        select
            block_time,
            day,
            pool_type,
            address,
            withdrawn,
            (
                case
                    when (
                        total>=32
                        and pool_type='Permissionless'
                    ) then ((withdrawn -32)*0.7875)
                    when (
                        total>=32
                        and pool_type='Permissioned'
                    ) then ((withdrawn -32)*0.9)
                    when total<32 then 0
                end
            ) user_reward,
            (
                case
                    when (
                        total>=32
                        and pool_type='Permissionless'
                        and block_time>timestamp '2023-08-09 06:35'
                    ) then ((withdrawn -32)*0.1775)
                    when (
                        total>=32
                        and pool_type='Permissionless'
                        and block_time<=timestamp '2023-08-09 06:35'
                    ) then ((withdrawn -32)*0.16875)
                    when (
                        total>=32
                        and pool_type='Permissioned'
                    ) then ((withdrawn -32)*0.05)
                    when total<32 then 0
                end
            ) operator_reward,
            (
                case
                    when (
                        total>=32
                        and pool_type='Permissionless'
                        and block_time>timestamp '2023-08-09 06:35'
                    ) then ((withdrawn -32)*0.035)
                    when (
                        total>=32
                        and pool_type='Permissionless'
                        and block_time<=timestamp '2023-08-09 06:35'
                    ) then ((withdrawn -32)*0.04375)
                    when (
                        total>=32
                        and pool_type='Permissioned'
                    ) then ((withdrawn -32)*0.05)
                    when total<32 then 0
                end
            ) stader_reward
        from
            penalties
        where
            rnk=1
    ),
    good_txs as (
        select
            block_time,
            day,
            pool_type,
            address,
            withdrawn,
            (
                case
                    when (
                        withdrawn>=32
                        and pool_type='Permissionless'
                    ) then ((withdrawn -32)*0.7875)
                    when (
                        withdrawn>=32
                        and pool_type='Permissioned'
                    ) then ((withdrawn -32)*0.9)
                    when (
                        withdrawn<32
                        and pool_type='Permissionless'
                    ) then (withdrawn*0.7875)
                    when (
                        withdrawn<32
                        and pool_type='Permissioned'
                    ) then (withdrawn*0.9)
                end
            ) user_reward,
            (
                case
                    when (
                        withdrawn>=32
                        and pool_type='Permissionless'
                        and block_time>timestamp '2023-08-09 06:35'
                    ) then ((withdrawn -32)*0.1775)
                    when (
                        withdrawn>=32
                        and pool_type='Permissionless'
                        and block_time<=timestamp '2023-08-09 06:35'
                    ) then ((withdrawn -32)*0.16875)
                    when (
                        withdrawn>=32
                        and pool_type='Permissioned'
                    ) then ((withdrawn -32)*0.05)
                    when (
                        withdrawn<32
                        and pool_type='Permissionless'
                        and block_time>timestamp '2023-08-09 06:35'
                    ) then (withdrawn*0.1775)
                    when (
                        withdrawn<32
                        and pool_type='Permissionless'
                        and block_time<=timestamp '2023-08-09 06:35'
                    ) then (withdrawn*0.16875)
                    when (
                        withdrawn<32
                        and pool_type='Permissioned'
                    ) then (withdrawn*0.05)
                end
            ) operator_reward,
            (
                case
                    when (
                        withdrawn>=32
                        and pool_type='Permissionless'
                        and block_time>timestamp '2023-08-09 06:35'
                    ) then ((withdrawn -32)*0.035)
                    when (
                        withdrawn>=32
                        and pool_type='Permissionless'
                        and block_time<=timestamp '2023-08-09 06:35'
                    ) then ((withdrawn -32)*0.04375)
                    when (
                        withdrawn>=32
                        and pool_type='Permissioned'
                    ) then ((withdrawn -32)*0.05)
                    when (
                        withdrawn<32
                        and pool_type='Permissionless'
                        and block_time>timestamp '2023-08-09 06:35'
                    ) then (withdrawn*0.035)
                    when (
                        withdrawn<32
                        and pool_type='Permissionless'
                        and block_time<=timestamp '2023-08-09 06:35'
                    ) then (withdrawn*0.04375)
                    when (
                        withdrawn<32
                        and pool_type='Permissioned'
                    ) then (withdrawn*0.05)
                end
            ) stader_reward
        from
            withdrawals
        where
            not (
                withdrawn<32
                and withdrawn>=28
            )
    ),
    consolidated as (
        select
            *
        from
            good_txs
        union
        select
            *
        from
            penalty_val
    ),
    cl_rewards as (
        select
            day,
            'CL rewards' reward_type,
            pool_type,
            SUM(user_reward) user_reward,
            SUM(stader_reward) stader_reward,
            SUM(operator_reward) operator_reward
        from
            consolidated
        group by
            1,
            2,
            3
        order by
            day desc
    ),
    base_data AS (
        SELECT
            A.day,
            DATE_TRUNC('month', A.day) AS month,
            SUM(stader_reward*price) AS stader_revenue,
            SUM(operator_reward*price) AS operator_rewards,
            SUM(user_reward*price) AS user_rewards
        FROM
            el_vaults A
            LEFT JOIN eth_price B ON A.day=B.day
        GROUP BY
            1,
            2
        UNION
        SELECT
            A.day,
            DATE_TRUNC('month', A.day) AS month,
            SUM(stader_reward*price) AS stader_revenue,
            SUM(operator_reward*price) AS operator_rewards,
            SUM(user_reward*price) AS user_rewards
        FROM
            cl_rewards A
            LEFT JOIN eth_price B ON A.day=B.day
        GROUP BY
            1,
            2
        UNION
        SELECT
            A.day,
            DATE_TRUNC('month', A.day) AS month,
            SUM(stader_reward*price) AS stader_revenue,
            SUM(operator_reward*price) AS operator_rewards,
            SUM(user_reward*price) AS user_rewards
        FROM
            el_vaults A
            LEFT JOIN eth_price B ON A.day=B.day
        GROUP BY
            1,
            2
    )
SELECT
    *
FROM
    base_data
WHERE
    day=CAST('{{target_date}}' AS DATE)
ORDER BY
    day DESC