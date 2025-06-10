import { gql } from "graphql-request";
import { client, ETH_TOKEN_ID, secondsToTheGraphTimestamp } from "./common";

const queryString = gql`
  query DailyInstantWithdrawalEthFeeStatsQuery(
    $start: Timestamp!
    $end: Timestamp!
  ) {
    instantWithdrawStats(
      interval: day
      where: {
        timestamp_gte: $start,
        timestamp_lte: $end,
        withdrawnToken: "${ETH_TOKEN_ID}"
      }
    ) {
      totalFeeAmount
    }
  }
`;

export async function getInstantWithdrawalFeesWei(
  startSeconds: number,
  endSeconds: number
): Promise<bigint> {
  const resp = await client.request(queryString, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
  });

  const instantWithdrawalFeesWei = resp.instantWithdrawStats
    .reduce(
      (sum: bigint, stat: any) => sum + BigInt(stat.totalFeeAmount),
      0n
    );

  return instantWithdrawalFeesWei;
}
