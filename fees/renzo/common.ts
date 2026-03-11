import ADDRESSES from '../../helpers/coreAssets.json'
import { gql, GraphQLClient } from "graphql-request";

const EZ_REZ = "0x77b1183e730275f6a8024ce53d54bcc12b368f60";
const EZ_EIGEN = "0xd4fcde9bb1d746dd7e5463b01dd819ee06af25db";
const RENZO_OWNED_VAULTS = [
  EZ_REZ,
  EZ_EIGEN,
];
const EZETH_HISTORICAL_DATA_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_clsxzkxi8dh7o01zx5kyxdga4/subgraphs/historical-data/stable/gn"

const ETH_TOKEN_ID = ADDRESSES.GAS_TOKEN_2;

const client = new GraphQLClient(EZETH_HISTORICAL_DATA_SUBGRAPH_URL);

const secondsToTheGraphTimestamp = (seconds: number) => {
  const ms = seconds * 1000;
  const theGraphTimestamp = ms * 1000;
  return String(theGraphTimestamp);
};

// Helper function to reduce fee stats to total
const reduceToTotal = (
  stats: Array<{
    totalFeeAmountWei?: string;
    totalFeeAmount?: string;
    totalAmountWei?: string;
    totalDepositAmount?: string;
    totalDistributionEarned?: string
  }>
): bigint => {
  return stats.reduce((sum: bigint, stat: any) => {
    const amount =
      stat.totalFeeAmountWei ||
      stat.totalFeeAmount ||
      stat.totalAmountWei ||
      stat.totalDepositAmount ||
      stat.totalDistributionEarned ||
      "0";
    return sum + BigInt(amount);
  }, 0n);
};

// Helper function to aggregate ERC20 fees by token from vault fee stats
const aggregateVaultERC20Fees = (stats: Array<{
  feeToken: { id: string },
  totalFeeAmount: string
}>): [string, bigint][] => {
  const tokenFeesMap = new Map<string, bigint>();

  for (const stat of stats) {
    const tokenId = stat.feeToken.id;
    const currentAmount = tokenFeesMap.get(tokenId) || 0n;
    tokenFeesMap.set(tokenId, currentAmount + BigInt(stat.totalFeeAmount));
  }

  return Array.from(tokenFeesMap.entries());
};

const aggregateVaultERC20Earnings = (stats: Array<{
  vault?: {
    underlyingToken: { id: string }
  },
  token?: {
    id: string
  },
  totalDepositAmount: string
}>): [string, bigint][] => {
  const tokenFeesMap = new Map<string, bigint>();

  for (const stat of stats) {
    const tokenId = stat?.vault?.underlyingToken?.id || stat?.token?.id;
    const currentAmount = tokenFeesMap.get(tokenId!) || 0n;
    tokenFeesMap.set(tokenId!, currentAmount + BigInt(stat.totalDepositAmount));
  }

  return Array.from(tokenFeesMap.entries());
};

// Helper function to aggregate ERC20 fees by token from instant withdrawal stats
const aggregateInstantWithdrawalERC20Fees = (stats: Array<{
  withdrawnToken: { id: string },
  totalFeeAmount: string
}>): [string, bigint][] => {
  const tokenFeesMap = new Map<string, bigint>();

  for (const stat of stats) {
    const tokenId = stat.withdrawnToken.id;
    const currentAmount = tokenFeesMap.get(tokenId) || 0n;
    tokenFeesMap.set(tokenId, currentAmount + BigInt(stat.totalFeeAmount));
  }

  return Array.from(tokenFeesMap.entries());
};

const ethFeesQuery = gql`
  query RenzoETHFeesQuery($start: Timestamp!, $end: Timestamp!) {
    stakingConsensusProtocolFeeStats(
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalFeeAmountWei
    }
    
    stakingExecutionProtocolFeeStats(
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalFeeAmountWei
    }
    
    rewardDepositProtocolFeeStats(
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalFeeAmountWei
    }
    
    rewardForwardProtocolFeeStats(
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalFeeAmountWei
    }
    
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

const ethEarningsQuery = gql`
  query RenzoETHEarningsQuery($start: Timestamp!, $end: Timestamp!) {
    stakingConsensusEarningStats (
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalAmountWei
    }

    stakingExecutionEarningStats (
      interval: day 
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalAmountWei
    }

    rewardDepositEarningStats (
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalAmountWei
    }

    rewardForwardEarningStats (
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalAmountWei
    }

    lidoDistributionEarningStats (
      interval: day
      where: { timestamp_gte: $start, timestamp_lte: $end }
    ) {
      totalDistributionEarned
    }
  }
`;

const erc20FeesQuery = gql`
  query RenzoERC20FeesQuery($start: Timestamp!, $end: Timestamp!, $vaults: [ID!]!) {
    # Vault reward fees (ERC20)
    vaultRewardFeeStats(
      interval: day
      where: {
        feeType: vault,
        timestamp_gte: $start,
        timestamp_lte: $end,
      }
    ) {
      feeToken {
        id
        symbol
        decimals
      }
      totalFeeAmount
    }
    
    # Vault protocol fees (ERC20)
    vaultProtocolFeeStats: vaultRewardFeeStats(
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
      feeToken {
        id
        symbol
        decimals
      }
      totalFeeAmount
    }
    
    # Instant withdrawal fees (ERC20 only)
    instantWithdrawStatsErc20: instantWithdrawStats(
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

const erc20EarningsQuery = gql`
  query RenzoERC20EarningsQuery($start: Timestamp!, $end: Timestamp!, $vaults: [ID!]!) {
    vaultRewardDepositStats(
      interval: day
      where: {
        timestamp_gte: $start,
        timestamp_lte: $end,
        vault_: {
          id_in: $vaults
        }
      }
    ) {
      vault {
        underlyingToken {
          id
        }
      }
      totalDepositAmount
    }

    vaultRewardForwardStats(
      interval: day
      where: {
        timestamp_gte: $start,
        timestamp_lte: $end,
        vault_: {
          id_in: $vaults
        }
      }
    ) {
      token {
        id
      }
      totalDepositAmount
    }
  }
`;

export interface ETHFeesResult {
  stakingConsensusFeesWei: bigint;
  stakingExecutionFeesWei: bigint;
  rewardsDepositedFeesWei: bigint;
  rewardsForwardedFeesWei: bigint;
  instantWithdrawalFeesWei: bigint;
}

export interface ETHEarningsResult {
  stakingConsensusEarningsWei: bigint;
  stakingExecutionEarningsWei: bigint;
  rewardsDepositedEarningsWei: bigint;
  rewardsForwardedEarningsWei: bigint;
  lidoDistributionEarningsWei: bigint;
}

export interface ERC20FeesResult {
  vaultRewardERC20Fees: [string, bigint][];
  vaultProtocolERC20Fees: [string, bigint][];
  instantWithdrawalERC20Fees: [string, bigint][];
}

export interface ERC20EarningsResult {
  vaultDepositedERC20Earnings: [string, bigint][];
  vaultForwardedERC20Earnings: [string, bigint][];
}

export async function getETHFeesWei(
  startSeconds: number,
  endSeconds: number
): Promise<ETHFeesResult> {
  const resp = await client.request(ethFeesQuery, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
  });

  return {
    stakingConsensusFeesWei: reduceToTotal(resp.stakingConsensusProtocolFeeStats),
    stakingExecutionFeesWei: reduceToTotal(resp.stakingExecutionProtocolFeeStats),
    rewardsDepositedFeesWei: reduceToTotal(resp.rewardDepositProtocolFeeStats),
    rewardsForwardedFeesWei: reduceToTotal(resp.rewardForwardProtocolFeeStats),
    instantWithdrawalFeesWei: reduceToTotal(resp.instantWithdrawStats),
  };
}

export async function getETHEarningsWei(
  startSeconds: number,
  endSeconds: number
): Promise<ETHEarningsResult> {
  const resp = await client.request(ethEarningsQuery, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
  });

  return {
    stakingConsensusEarningsWei: reduceToTotal(resp.stakingConsensusEarningStats),
    stakingExecutionEarningsWei: reduceToTotal(resp.stakingExecutionEarningStats),
    rewardsDepositedEarningsWei: reduceToTotal(resp.rewardDepositEarningStats),
    rewardsForwardedEarningsWei: reduceToTotal(resp.rewardForwardEarningStats),
    lidoDistributionEarningsWei: reduceToTotal(resp.lidoDistributionEarningStats),
  }
}

export async function getERC20FeesData(
  startSeconds: number,
  endSeconds: number
): Promise<ERC20FeesResult> {
  const resp = await client.request(erc20FeesQuery, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
    vaults: RENZO_OWNED_VAULTS,
  });

  return {
    vaultRewardERC20Fees: aggregateVaultERC20Fees(resp.vaultRewardFeeStats),
    vaultProtocolERC20Fees: aggregateVaultERC20Fees(resp.vaultProtocolFeeStats),
    instantWithdrawalERC20Fees: aggregateInstantWithdrawalERC20Fees(resp.instantWithdrawStatsErc20),
  };
}

export async function getERC20EarningsData(
  startSeconds: number,
  endSeconds: number
): Promise<ERC20EarningsResult> {
  const resp = await client.request(erc20EarningsQuery, {
    start: secondsToTheGraphTimestamp(startSeconds),
    end: secondsToTheGraphTimestamp(endSeconds),
    vaults: RENZO_OWNED_VAULTS,
  });

  return {
    vaultDepositedERC20Earnings: aggregateVaultERC20Earnings(resp.vaultRewardDepositStats),
    vaultForwardedERC20Earnings: aggregateVaultERC20Earnings(resp.vaultRewardForwardStats),
  };
}