import { gql } from "graphql-request";
import { client, secondsToTheGraphTimestamp } from "./common";

const query = gql`
  query DailyStakingConsensusFeeStatsQuery(
    $start: Timestamp!
    $end: Timestamp!
  ) {
    stakingConsensusProtocolFeeStats(
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalFeeAmountWei
    }
  }
`;

export async function getStakingConsensusFeesWei(
  startSeconds: number,
  endSeconds: number
): Promise<bigint> {
  const resp = await client.request(query, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
  });

  const stakingConsensusFeesWei = resp.stakingConsensusProtocolFeeStats
    .reduce(
      (sum: bigint, stat: any) => sum + BigInt(stat.totalFeeAmountWei),
      0n
    );

  return stakingConsensusFeesWei;
}
