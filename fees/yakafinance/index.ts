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
            start: 1719432193, // TODO: Add accurate timestamp
        },
    },
};
export default adapter;


const STABLE_FEES = 0.0004;
const VOLATILE_FEES = 0.0018;
const endpoint = "https://api.studio.thegraph.com/query/82132/yaka-finance/version/latest";

const fetchV1 = () => {
    return async ({ getToBlock, getFromBlock }: FetchOptions) => {
        const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

        const query = gql`
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
            dailyFees: dailyFee.toString(),
            dailyRevenue: dailyFee.toString(),
            dailyHoldersRevenue: dailyFee.toString(),
        };
    };
};