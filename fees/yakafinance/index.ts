import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import request, { gql } from "graphql-request";
import BigNumber from "bignumber.js";

const getFees = async (options: FetchOptions) => {
    const [feeV1] = await Promise.all([fetchV1()(options)]);
    const dailyFees = Number(feeV1.dailyFees);
    const dailyRevenue = Number(feeV1.dailyRevenue);
    const dailyHoldersRevenue = Number(feeV1.dailyHoldersRevenue);
    return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyRevenue}`,
        dailyHoldersRevenue: `${dailyHoldersRevenue}`,
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SEI]: {
            fetch: getFees,
            start: 1719432193,
        },
    },
};
export default adapter;


const STABLE_FEES = 0.0004;
const VOLATILE_FEES = 0.0018;
const PROTOCOL_FEE_RATE = 0.12;
const endpoint = "https://api.goldsky.com/api/public/project_cltwdng5fw97s01x16mntew1i/subgraphs/yaka-finance/1.0.0/gn"
const blocksEndpoint = "https://api.studio.thegraph.com/query/82132/sei-blocks/version/latest"

function getUnixTimeNow() {
    return Math.floor(Date.now() / 1000)
}

function getBlocks(timestamps) {
    let queryString = 'query blocks {'
    queryString += timestamps.map((timestamp) => {
        return `t${timestamp}:blocks(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_gt: ${timestamp}, timestamp_lt: ${timestamp + 600} }) {
        number
        }`
    })
    queryString += '}'
    return gql`${queryString}`
}



const fetchV1 = () => {
    return async ({ }: FetchOptions) => {
        const utcCurrentTime = getUnixTimeNow()
        const utcOneDayBack = utcCurrentTime - 86400

        const blocksQuery = getBlocks([utcOneDayBack])
        const blocksRes = await request(blocksEndpoint, blocksQuery)
        console.log(blocksRes)
        let blocks = []
        for (const block in blocksRes) {
            blocks.push(blocksRes[block][0].number)
        }
        const fromBlock = blocks[0]
        const query = gql`
      query fees {
        yesterday: pairs(block: {number: ${fromBlock}}, where: {volumeUSD_gt: "0"}, first: 1000) {
          id
          isStable
          volumeUSD
        }
        today: pairs(where: {volumeUSD_gt: "0"}, first: 1000) {
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
            dailyFees: dailyFee.toString(),
            dailyRevenue: dailyFee.times(PROTOCOL_FEE_RATE).toString(),
            dailyHoldersRevenue: dailyFee.minus(dailyFee.times(PROTOCOL_FEE_RATE)).toString(),
        };
    };
};