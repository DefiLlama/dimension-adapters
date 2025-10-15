import axios from "axios";
import { httpGet, httpPost } from "../utils/fetchURL";
import { GraphQLClient } from "graphql-request";

export const APTOS_RPC = 'https://aptos-mainnet.pontem.network';

// Number of decimals for the APT token.
const APT_DECIMALS = 8;

// Number to multiply and APT value to get the amount in Octas.
const APT_TO_OCTAS_MUTLIPLIER = Math.pow(10, APT_DECIMALS);

// Takes an amount in Octas as input and returns the same amount in APT.
const octasToApt = (octas: number | bigint) => {
    if (typeof octas === "number") {
        return octas / APT_TO_OCTAS_MUTLIPLIER;
    } else {
        return Number(octas) / APT_TO_OCTAS_MUTLIPLIER;
    }
}

const graphQLClient = new GraphQLClient("https://api.mainnet.aptoslabs.com/v1/graphql");

// Query to get the latest block.
const latestBlockQuery = `query LatestBlock {
  block_metadata_transactions(order_by: {version: desc}, limit: 1) {
    block_height
  }
}`;

// Query to get a block.
const blockQuery = `query Block($block: bigint) {
  block_metadata_transactions(limit: 1, where: {block_height: {_eq: $block}}) {
    timestamp
    version
  }
}`;

// Query to get a block range.
const blockRangeQuery = `query Block($firstBlock: bigint, $limit: Int) {
  block_metadata_transactions(limit: $limit, where: {block_height: {_gte: $firstBlock}}, order_by: {block_height: asc}) {
    timestamp
    version
  }
}`;

// Given a timestamp, returns the transaction version that is closest to that timestamp.
const getVersionFromTimestamp = async (timestamp: Date, minBlock = 0) => {
    let left = minBlock;
    let right = await graphQLClient.request(latestBlockQuery).then(r => Number(r.block_metadata_transactions[0].block_height));
    let middle;
    while (left + 100 < right) {
        middle = Math.round((left + right) / 2);
        const middleBlock = await graphQLClient.request(blockQuery, { block: middle }).then(r => r.block_metadata_transactions[0]);
        const middleBlockDate = new Date(middleBlock.timestamp);
        if (middleBlockDate.getTime() === timestamp.getTime()) {
            return Number(middleBlock.version);
        }
        if (timestamp.getTime() < middleBlockDate.getTime()) {
            right = middle;
        } else {
            left = middle + 1;
        }
    }
    const blocks: { timestamp: string, version: string }[] = await graphQLClient.request(
        blockRangeQuery,
        { firstBlock: left, limit: right - left }
    ).then(r => r.block_metadata_transactions);
    const mappedBlocks = blocks.map((e) => ({
        version: Number(e.version),
        delta: Math.abs(timestamp.getTime() - new Date(e.timestamp).getTime())
    }));
    mappedBlocks.sort((a, b) => a.delta - b.delta);
    return mappedBlocks[0].version;
}

const getResources = async (account: string): Promise<any[]> => {
    const data: any = []
    let lastData: any;
    let cursor
    do {
        let url = `${APTOS_RPC}/v1/accounts/${account}/resources?limit=9999`
        if (cursor) url += '&start=' + cursor
        const res = await httpGet(url, undefined, { withMetadata: true })
        lastData = res.data
        data.push(...lastData)
        cursor = res.headers['x-aptos-cursor']
    } while (lastData.length === 9999)
    return data
}

async function view<T extends any[]>(functionStr: string, type_arguments: string[] = [], args: (string | boolean | number)[] = [], ledgerVersion?: bigint | number): Promise<T> {
    let path = `https://fullnode.mainnet.aptoslabs.com/v1/view`
    if (ledgerVersion !== undefined) path += `?ledger_version=${ledgerVersion.toString()}`
    return (await httpPost(path, { "function": functionStr, "type_arguments": type_arguments, arguments: args })) as T
}

// return UI value - total supply of given token
async function getCoinSupply(coin: string): Promise<{
    decimals: number;
    supply: number;
}> {
    const { data: { decimals, supply } } = await httpGet(`${APTOS_RPC}/v1/accounts/${coin.split('::')[0]}/resource/0x1::coin::CoinInfo<${coin}>`)
    return {
        decimals: Number(decimals),
        supply: Number(supply.vec[0].integer.vec[0].value),
    }
}

export {
    getResources,
    getVersionFromTimestamp,
    octasToApt,
    view,
    getCoinSupply,
}
