import { gql } from "graphql-request";
import { client, secondsToTheGraphTimestamp } from "./common";

const queryString = gql`
  query DailyStakingExecutionFeeStatsQuery(
    $start: Timestamp!
    $end: Timestamp!
  ) {
    stakingExecutionProtocolFeeStats(
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalFeeAmountWei
    }
  }  
`

export async function getStakingExecutionFeesWei(
  startSeconds: number,
  endSeconds: number
): Promise<bigint> {
  const resp = await client.request(queryString, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
  });

  const stakingExecutionFeesWei = resp.stakingExecutionProtocolFeeStats
    .reduce(
      (sum: bigint, stat: any) => sum + BigInt(stat.totalFeeAmountWei),
      0n
    );

  return stakingExecutionFeesWei;
}