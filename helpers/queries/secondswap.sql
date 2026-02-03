/*
  SecondSwap Volume and Fees Query
  
  Aggregates trading volume and fees across all chains.
  Returns volume and fees per chain for the specified time period.
  
  Parameters:
    {{start}} - Unix timestamp for start of period
    {{end}} - Unix timestamp for end of period
*/

WITH
mp AS (
    SELECT 
        chain,
        MAX(contract_address) AS marketplace
    FROM dune.secondswapio.result_get_all_spot_purchase_events_from_marketplace
    GROUP BY chain
),

mp_txs_evm AS (
    SELECT 
        chain,
        evt_tx_hash,
        buyerfee,
        sellerfee
    FROM dune.secondswapio.result_get_all_spot_purchase_events_from_marketplace
    WHERE evt_block_time >= from_unixtime({{start}})
    AND evt_block_time <= from_unixtime({{end}})
    AND chain IN ('ethereum', 'avalanche_c')
),

ethereum_transfers AS (
    SELECT
        'ethereum' AS chain,
        t.contract_address,
        t.value,
        t.evt_tx_hash,
        t."to",
        m.buyerfee,
        m.sellerfee
    FROM erc20_ethereum.evt_Transfer t
    INNER JOIN mp_txs_evm m ON t.evt_tx_hash = m.evt_tx_hash AND m.chain = 'ethereum'
    WHERE t.evt_block_time >= from_unixtime({{start}})
    AND t.evt_block_time <= from_unixtime({{end}})
),

avalanche_transfers AS (
    SELECT
        'avalanche_c' AS chain,
        t.contract_address,
        t.value,
        t.evt_tx_hash,
        t."to",
        m.buyerfee,
        m.sellerfee
    FROM erc20_avalanche_c.evt_Transfer t
    INNER JOIN mp_txs_evm m ON t.evt_tx_hash = m.evt_tx_hash AND m.chain = 'avalanche_c'
    WHERE t.evt_block_time >= from_unixtime({{start}})
    AND t.evt_block_time <= from_unixtime({{end}})
),

all_transfers AS (
    SELECT * FROM ethereum_transfers
    UNION ALL
    SELECT * FROM avalanche_transfers
),

mp_transfers AS (
    SELECT 
        f.chain,
        f.contract_address,
        f.value,
        f.buyerfee,
        f.sellerfee
    FROM all_transfers f
    JOIN mp ON f."to" = mp.marketplace AND f.chain = mp.chain
),

evm_decimals AS (
    SELECT 
        CASE 
            WHEN blockchain = 'ethereum' THEN 'ethereum'
            WHEN blockchain = 'avalanche_c' THEN 'avalanche_c'
        END AS chain,
        contract_address, 
        decimals
    FROM tokens.erc20
    WHERE blockchain IN ('ethereum', 'avalanche_c')
    AND contract_address IN (
        SELECT contract_address FROM mp_transfers WHERE chain IN ('ethereum', 'avalanche_c')
    )
),

all_decimals AS (
    SELECT * FROM evm_decimals
)

SELECT 
    m.chain,
    SUM(m.value / POW(10, COALESCE(td.decimals, CASE WHEN m.chain = 'solana' THEN 9 ELSE 18 END))) AS usd_volume,
    SUM((m.buyerfee + m.sellerfee) / POW(10, COALESCE(td.decimals, CASE WHEN m.chain = 'solana' THEN 9 ELSE 18 END))) AS usd_fee
FROM mp_transfers m
LEFT JOIN all_decimals td ON m.contract_address = td.contract_address AND m.chain = td.chain
GROUP BY m.chain
