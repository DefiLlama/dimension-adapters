import { gql } from "graphql-request";
import { client, secondsToTheGraphTimestamp } from "./common";

const queryString = gql`
  query DailyVaultRewardFeeStatsQuery(
    $start: Timestamp!
    $end: Timestamp!
  ) {
    vaultRewardFeeStats(
      interval: day
      where: {
        feeType: vault,
        timestamp_gte: $start,
        timestamp_lte: $end,
      }
    ) {
      timestamp
      feeToken {
        id
        symbol
        decimals
      }
      totalFeeAmount
    }
  }
`;

export async function getVaultRewardERC20Fees(
  startSeconds: number,
  endSeconds: number
): Promise<[string, bigint][]> {
  const resp = await client.request(queryString, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
  });

  const uniqueTokenIds = new Set<string>();
  for (const { feeToken } of resp.vaultRewardFeeStats) {
    uniqueTokenIds.add(feeToken.id);
  }

  const initialERC20Fees: [string, bigint][] = Array.from(uniqueTokenIds).map(tokenId => [tokenId, 0n]);
  const initialERC20FeesByTokenId = Object.fromEntries(initialERC20Fees);

  const vaultRewardFeeStats = resp.vaultRewardFeeStats
    .reduce((acc, { feeToken, totalFeeAmount }) => {
      const tokenId = feeToken.id;
      acc[tokenId] = acc[tokenId] + BigInt(totalFeeAmount);
      return acc;
    }, initialERC20FeesByTokenId);

  const vaultRewardERC20Fees = Object.entries<bigint>(vaultRewardFeeStats);
  return vaultRewardERC20Fees;
}
