import { queryFlipside } from "../../helpers/flipsidecrypto";
import { convertChainToFlipside, isAcceptedChain } from "./convertChain";
import { ChainAddresses, ProtocolAddresses } from "./types";

export async function countNewUsers(addresses: ChainAddresses, start:number, end:number) {
    const chainAddresses = Object.entries(addresses).filter(([chain])=>isAcceptedChain(chain)).reduce((all, c)=>all.concat(c[1]), [] as string[])
    const query = await queryFlipside(`
WITH
  all_new_users AS (
    SELECT DISTINCT
      MIN(block_timestamp) OVER (
        PARTITION BY
          from_address
      ) AS first_seen_timestamp,
      from_address,
      COUNT(*) OVER (
        PARTITION BY
          from_address
      ) AS total_txs,
      FIRST_VALUE(tx_hash) OVER (
        PARTITION BY
          from_address
        ORDER BY
          block_timestamp ASC
      ) AS first_seen_tx_hash,
      FIRST_VALUE(chain) OVER (
        PARTITION BY
          from_address
        ORDER BY
          block_timestamp ASC
      ) AS first_seen_chain
    FROM
      (
        SELECT
          block_timestamp,
          from_address,
          tx_hash,
          to_address,
          'bsc' as chain
        FROM
          bsc.core.fact_transactions
        UNION ALL
        SELECT
          block_timestamp,
          from_address,
          tx_hash,
          to_address,
          'ethereum' as chain
        FROM
          ethereum.core.fact_transactions
        UNION ALL
        SELECT
          block_timestamp,
          from_address,
          tx_hash,
          to_address,
          'polygon' as chain
        FROM
          polygon.core.fact_transactions
        UNION ALL
        SELECT
          block_timestamp,
          from_address,
          tx_hash,
          to_address,
          'arbitrum' as chain
        FROM
          arbitrum.core.fact_transactions
        UNION ALL
        SELECT
          block_timestamp,
          from_address,
          tx_hash,
          to_address,
          'optimism' as chain
        FROM
          optimism.core.fact_transactions
        UNION ALL
        SELECT
          block_timestamp,
          from_address,
          tx_hash,
          to_address,
          'avalanche' as chain
        FROM
          avalanche.core.fact_transactions
      ) t
    WHERE
      t.to_address IN (${chainAddresses.map(a => `'${a.toLowerCase()}'`).join(',')})
  )
SELECT
  COUNT(*)
FROM
  all_new_users
WHERE
  first_seen_timestamp BETWEEN TO_TIMESTAMP_NTZ(${start}) AND TO_TIMESTAMP_NTZ(${end});
`)
    return query[0][0]
}

export function countUsers(addresses: ChainAddresses) {
    return async (start: number, end: number) => {
        const chainArray = Object.entries(addresses).filter(([chain])=>isAcceptedChain(chain))
        const query = await queryFlipside(`
WITH
  ${chainArray.map(([chain, chainAddresses])=>
    `${chain} AS (
        SELECT
            FROM_ADDRESS,
            TX_HASH,
            TX_FEE
        FROM
            ${convertChainToFlipside(chain)}.core.fact_transactions
        WHERE
            ${chainAddresses.length>1?
                `TO_ADDRESS in (${chainAddresses.map(a=>`'${a.toLowerCase()}'`).join(',')})`:
                `TO_ADDRESS = '${chainAddresses[0].toLowerCase()}'`}
            AND BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start})
            AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})
        ),
        ${chain}_total AS (
            SELECT
              sum(TX_FEE) AS ${chain}_total_gas,
              count(TX_HASH) AS ${chain}_tx_count
            FROM
            ${chain}
          ),
          ${chain}_unique AS (
            SELECT DISTINCT
              FROM_ADDRESS
            FROM
            ${chain}
          ), -- unique users`).join(',\n')},
both AS (
    ${chainArray.map(([chain])=>`SELECT
    FROM_ADDRESS
FROM
    ${chain}`).join("\nUNION ALL\n")}),
${chainArray.map(([chain])=>`${chain}_count AS (
    SELECT
    COUNT(FROM_ADDRESS) AS ${chain}_count_col
    FROM
    ${chain}_unique
)`).join(',\n')},
both_count AS (
    SELECT
    COUNT(DISTINCT FROM_ADDRESS) AS both_count
    FROM
    both
)
SELECT
${chainArray.map(([chain])=>`${chain}_count_col, ${chain}_tx_count, ${chain}_total_gas`).join(', ')},
both_count
FROM
both_count CROSS JOIN
${chainArray.map(([chain])=>`${chain}_total CROSS JOIN ${chain}_count`).join(' CROSS JOIN ')};`
        )
        const finalNumbers = Object.fromEntries((chainArray).map(([name], i)=>[name, {
            users: query[0][i*3],
            txs: query[0][i*3+1],
            gas: query[0][i*3+2],
        }]))
        finalNumbers.all = {
            users:query[0][query[0].length-1]
        } as any
        return finalNumbers
    }
}

export const isAddressesUsable = (addresses:ProtocolAddresses)=>{
    return Object.entries(addresses.addresses).some(([chain, addys])=> isAcceptedChain(chain) && addys && addys.length>0)
}