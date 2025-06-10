import { gql } from "graphql-request";
import { client, secondsToTheGraphTimestamp } from "./common";
import { RENZO_OWNED_VAULTS } from "../constants";

const queryString = gql`
  query DailyVaultProtocolFeeStatsQuery(
    $start: Timestamp!
    $end: Timestamp!
    $vaults: [ID!]!
  ) {
    vaultRewardFeeStats(
      interval: day
      where: {
        feeType: protocol,
        vault_: {
          id_in: $vaults
        },
        timestamp_gte: $start,
        timestamp_lte: $end
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

export async function getVaultProtocolERC20Fees(
  startSeconds: number,
  endSeconds: number
): Promise<[string, bigint][]> {
  const resp = await client.request(queryString, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
    vaults: RENZO_OWNED_VAULTS,
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

  const vaultProtocolERC20Fees = Object.entries<bigint>(vaultRewardFeeStats);
  return vaultProtocolERC20Fees;
}
