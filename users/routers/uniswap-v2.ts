import routerAddresses from "./routerAddresses"
import { queryFlipside } from "../../helpers/flipsidecrypto";
import { convertChainToFlipside, isAcceptedChain } from "../utils/convertChain";

function getUsers(addresses: {
    [chain:string]:string[]
}) {
    return async (start: number, end: number) => {
        const chainArray = Object.entries(addresses).filter(([chain])=>isAcceptedChain(chain))
        const query = await queryFlipside(`
WITH
  ${chainArray.map(([chain, chainAddresses])=>
    `${chain} AS (
        SELECT DISTINCT
            FROM_ADDRESS
        FROM
            ${convertChainToFlipside(chain)}.core.fact_transactions
        WHERE
            ${chainAddresses.length>1?
                `TO_ADDRESS in (${chainAddresses.map(a=>`'${a.toLowerCase()}'`).join(',')})`:
                `TO_ADDRESS = '${chainAddresses[0].toLowerCase()}'`}
            AND BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start})
            AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})
        )`).join(',\n')},
both AS (
    ${chainArray.map(([chain])=>`SELECT
    FROM_ADDRESS
FROM
    ${chain}`).join("\nUNION ALL\n")}),
${chainArray.map(([chain])=>`${chain}_count AS (
    SELECT
    COUNT(FROM_ADDRESS) AS ${chain}_count_col
    FROM
    ${chain}
)`).join(',\n')},
both_count AS (
    SELECT
    COUNT(FROM_ADDRESS) AS both_count
    FROM
    both
)
SELECT
${chainArray.map(([chain])=>`${chain}_count_col`).join(', ')},
both_count
FROM
${chainArray.concat([["both", []]]).map(([chain])=>`${chain}_count`).join(' CROSS JOIN ')};`
        )
        return Object.fromEntries((query[0] as number[]).map((users, i)=>[chainArray.concat([["all", []]])[i][0], users]))
    }
}

export const users = routerAddresses.map(addresses=>({
    name: addresses.name,
    id: addresses.id,
    getUsers: getUsers(addresses.addresses as any)
}))