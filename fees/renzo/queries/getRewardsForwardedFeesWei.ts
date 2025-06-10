import { gql } from "graphql-request";
import { client, secondsToTheGraphTimestamp } from "./common";

const queryString = gql`
  query DailyRewardsForwardedFeeStatsQuery(
    $start: Timestamp!
    $end: Timestamp!
  ) {
    rewardForwardProtocolFeeStats(
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalFeeAmountWei
    }
  }
`;

export async function getRewardsForwardedFeesWei(
  startSeconds: number,
  endSeconds: number
): Promise<bigint> {
  const resp = await client.request(queryString, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
  });

  const rewardsForwardedFeesWei = resp.rewardForwardProtocolFeeStats
    .reduce(
      (sum: bigint, stat: any) => sum + BigInt(stat.totalFeeAmountWei),
      0n
    );

  return rewardsForwardedFeesWei;
}
