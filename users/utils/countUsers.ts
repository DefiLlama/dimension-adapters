import { queryFlipside } from "../../helpers/flipsidecrypto";
import { convertChainToFlipside, isAcceptedChain } from "./convertChain";
import { ChainAddresses, ProtocolAddresses } from "./types";

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