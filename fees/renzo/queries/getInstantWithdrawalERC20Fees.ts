import { gql } from "graphql-request";
import { client, ETH_TOKEN_ID, secondsToTheGraphTimestamp } from "./common";

const queryString = gql`
  query DailyInstantWithdrawalERC20FeeStatsQuery(
    $start: Timestamp!
    $end: Timestamp!
  ) {
    instantWithdrawStats(
      interval: day
      where: {
        timestamp_gte: $start,
        timestamp_lte: $end,
        withdrawnToken_: {
          id_not: "${ETH_TOKEN_ID}"
        }
      }
    ) {
      withdrawnToken {
        id
        symbol
        decimals
      }
      totalFeeAmount
    }
  }
`;

export async function getInstantWithdrawalERC20Fees(
  startSeconds: number,
  endSeconds: number
): Promise<[string, bigint][]> {
  const resp = await client.request(queryString, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
  });

  const uniqueTokenIds = new Set<string>();
  for (const { withdrawnToken } of resp.instantWithdrawStats) {
    uniqueTokenIds.add(withdrawnToken.id);
  }

  const initialERC20Fees: [string, bigint][] = Array.from(uniqueTokenIds).map(tokenId => [tokenId, 0n]);
  const initialERC20FeesByTokenId = Object.fromEntries(initialERC20Fees);

  const instantWithdrawalFeesByERC20 = resp.instantWithdrawStats
    .reduce((acc, { withdrawnToken, totalFeeAmount }) => {
      const tokenId = withdrawnToken.id;
      acc[tokenId] = acc[tokenId] + BigInt(totalFeeAmount);
      return acc;
    }, initialERC20FeesByTokenId);

  const instantWithdrawalERC20Fees = Object.entries<bigint>(instantWithdrawalFeesByERC20);
  return instantWithdrawalERC20Fees;
}
