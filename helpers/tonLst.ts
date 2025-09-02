import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter, FetchResultFees } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";

interface TonLstExportConfigs {
    poolAddress: string;
    feeShareRatio?: number;
};

async function fetchData(blockNumber: number, poolAddress: string): Promise<[number, number]> {
    const url = 'https://ton-mainnet.core.chainstack.com/f2a2411bce1e54a2658f2710cd7969c3/api/v2/runGetMethod';
    const payload: any = {
        address: poolAddress,
        method: "get_pool_full_data",
        stack: [
            [
                "tvm.Slice",
                "te6cckEBAQEAJAAAQ4AbUzrTQYTUv8s/I9ds2TSZgRjyrgl2S2LKcZMEFcxj6PARy3rF",
            ],
        ],
        seqno: blockNumber
    };

    const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    };

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        const totalAssets = parseInt(data.result.stack[3][1], 16);
        const totalShares = parseInt(data.result.stack[14][1], 16);
        return [totalAssets, totalShares];
    } catch (err: any) {
        throw new Error(`Error while fetching ton pool data: ${err.message}`);
    }
}

const fetchFees = async (options: FetchOptions, config: TonLstExportConfigs): Promise<FetchResultFees> => {
    let dailyFees = options.createBalances();
    let dailyRevenue = options.createBalances();
    const feeShareRatio = config.feeShareRatio ?? 0;
    const query = `
    WITH block_no_yesterday AS (
      SELECT 
        mc_block_seqno, 
        block_time
        FROM ton.blocks
        WHERE block_time > FROM_UNIXTIME(${options.fromTimestamp} - 60)
      AND block_time < FROM_UNIXTIME(${options.fromTimestamp} + 60)
        ORDER BY
      ABS(TO_UNIXTIME(block_time) - ${options.fromTimestamp}) LIMIT 1), 
    block_no_today AS (
      SELECT 
        mc_block_seqno, 
        block_time 
        FROM ton.blocks
        WHERE block_time > FROM_UNIXTIME(${options.toTimestamp} - 60)
      AND block_time < FROM_UNIXTIME(${options.toTimestamp} + 60)
        ORDER BY
      ABS(TO_UNIXTIME(block_time) - ${options.toTimestamp}) LIMIT 1)

    SELECT 
      mc_block_seqno
    FROM block_no_yesterday
    UNION ALL
        SELECT 
          mc_block_seqno
    FROM block_no_today
    ORDER BY 
      mc_block_seqno`;

    const queryResult = await queryDuneSql(options, query);
    if (queryResult.length == 2) {
        const yesterdaysSeqNo = queryResult[0].mc_block_seqno;
        const todaysSeqNo = queryResult[1].mc_block_seqno;
        const yesterdaysData = await fetchData(yesterdaysSeqNo, config.poolAddress);
        const todaysData = await fetchData(todaysSeqNo, config.poolAddress);

        if (yesterdaysData[0] != 0 && todaysData[0] != 0) {
            const votingRewardsInTonAfterFee = ((todaysData[0] / todaysData[1]) - (yesterdaysData[0] / yesterdaysData[1])) * (todaysData[1] / 1e9);

            const votingRewardsInTon = votingRewardsInTonAfterFee / ((100 - feeShareRatio) / 100);

            dailyFees.addCGToken("the-open-network", votingRewardsInTon);
            dailyRevenue.addCGToken("the-open-network", votingRewardsInTon - votingRewardsInTonAfterFee);
        };
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue
    };
}

export function tonLstExport(exportConfig: TonLstExportConfigs) {
    const adapter: SimpleAdapter = {
        version: 1,
        methodology: {
            Fees: 'Includes TON voting rewards earned by the pool',
            Revenue: 'Fee share taken from voting rewards',
            ProtocolRevenue: 'Part of the fees going to the protocol treasury',
        },
        fetch: (async (_a: any, _b: any, options: FetchOptions) => {
            const { dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchFees(options, exportConfig)

            return {
                dailyFees,
                dailyRevenue,
                dailyProtocolRevenue,
            }
        }),
        chains: [CHAIN.TON],
    }
    return adapter
}
