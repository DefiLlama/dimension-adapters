import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter, FetchResultFees } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

async function fetchData(blockNumber: number): Promise<[number, number]> {
  const url = 'https://ton-mainnet.core.chainstack.com/f2a2411bce1e54a2658f2710cd7969c3/api/v2/runGetMethod';
  const payload: any = {
    address: "EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR",
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
    throw new Error(`Error while fetching tonstakers data: ${err.message}`);
  }
}

const fetchFee = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  let dailyFees = options.createBalances();
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
    const yesterdaysData = await fetchData(yesterdaysSeqNo);
    const todaysData = await fetchData(todaysSeqNo);

    if (yesterdaysData[0] != 0 && todaysData[0] != 0) {
      const votingRewardsInTon = ((todaysData[0] / todaysData[1]) - (yesterdaysData[0] / yesterdaysData[1])) * (todaysData[1] / 1e9);

      dailyFees.addCGToken("the-open-network", votingRewardsInTon);
    }
  }

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0
  };
}

const methodology = {
  Fees: 'Includes TON staking rewards earned by tsTON holders',
  Revenue: `Tonstakers doesn't charge any fee`,
  ProtocolRevenue: `Tonstakers doesn't charge any fee`
};

const adapter: SimpleAdapter = {
  version: 1, //voting cycles once in 16 hours , so doesnt make sense to fetch hourly
  fetch: fetchFee,
  chains: [CHAIN.TON],
  start: '2025-04-01',
  methodology,
  isExpensiveAdapter: true
};

export default adapter;