import { gql } from "graphql-request";
import { client, secondsToTheGraphTimestamp } from "./common";

const queryString = gql`
  query DailyRewardsDepositedFeeStatsQuery(
    $start: Timestamp!
    $end: Timestamp!
  ) {
    rewardDepositProtocolFeeStats(
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalFeeAmountWei
    }
  }
`;

export async function getRewardsDepositedFeesWei(
  startSeconds: number,
  endSeconds: number
): Promise<bigint> {
  const resp = await client.request(queryString, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
  });

  const rewardsDepositedFeesWei = resp.rewardDepositProtocolFeeStats
    .reduce(
      (sum: bigint, stat: any) => sum + BigInt(stat.totalFeeAmountWei),
      0n
    );

  return rewardsDepositedFeesWei;
}
