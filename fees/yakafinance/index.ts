import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import request from "graphql-request";
import BigNumber from "bignumber.js";

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SEI]: {
            fetch: getFees as any,
            start: '2024-07-01',
        },
    },
};
export default adapter;


const STABLE_FEES = 0.0004;
const VOLATILE_FEES = 0.0018;
const PROTOCOL_FEE_RATE = 0.12;
const endpoint = "https://api.studio.thegraph.com/query/106608/yaka-finance/version/latest"
const blocksEndpoint = "https://api.studio.thegraph.com/query/82132/sei-blocks/version/latest"

async function getBlocks(timestamps: Array<number>) {
    let queryString = 'query blocks {'
    queryString += timestamps.map((timestamp) => {
        return `t${timestamp}:blocks(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_gt: ${timestamp}, timestamp_lt: ${timestamp + 600} }) {
        number
        }`
    })
    queryString += '}'
    const blocksRes = await request(blocksEndpoint, queryString)
    return timestamps.map((timestamp) => {
        return blocksRes[`t${timestamp}`][0].number
    })
}

async function getFees({ startTimestamp, endTimestamp }: FetchOptions) {
    const [fromBlock, toBlock] = await getBlocks([startTimestamp, endTimestamp])
    const query = `
      query fees {
        yesterday: pairs(block: {number: ${fromBlock}}, where: {volumeUSD_gt: "0"}, first: 1000) {
          id
          isStable
          volumeUSD
        }
        today: pairs(block: {number: ${toBlock}}, where: {volumeUSD_gt: "0"}, first: 1000) {
          id
          isStable
          volumeUSD
        }
      }
    `;
    const todayVolume: { [id: string]: BigNumber } = {};
    const graphRes = await request(endpoint, query);
    let dailyFee = new BigNumber(0);
    for (const pool of graphRes["today"]) {
        todayVolume[pool.id] = new BigNumber(pool.volumeUSD);
    }

    for (const pool of graphRes["yesterday"]) {
        if (!todayVolume[pool.id]) continue;
        const dailyVolume = BigNumber(todayVolume[pool.id]).minus(
            pool.volumeUSD
        );
        if (pool.isStable) {
            dailyFee = dailyFee.plus(dailyVolume.times(STABLE_FEES));
        } else {
            dailyFee = dailyFee.plus(dailyVolume.times(VOLATILE_FEES));
        }
    }

    return {
        dailyFees: dailyFee,
        dailyRevenue: dailyFee.times(PROTOCOL_FEE_RATE),
        dailySupplySideRevenue: dailyFee.times(1 - PROTOCOL_FEE_RATE),
        dailyHoldersRevenue: dailyFee.minus(dailyFee.times(PROTOCOL_FEE_RATE)),
    };
};