import axios from "axios";
import { ethers } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Clearpool public Subsquid GraphQL endpoint used for pool/vault snapshots and repayment operations.
const ENDPOINT = "https://squid.subsquid.io/cpool-squid/v/v1/graphql";
const RAY = 10n ** 18n;
const LIMIT = 500;
// ERC20 Transfer event topic used with DefiLlama indexed logs for repayment fee treasury inflows.
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type NetworkConfig = {
  network: string;
  start: string;
  repaymentFeeTreasury?: string;
};

type Token = {
  address: string;
};

type DynamicSnapshot = {
  cumulativeInterestEarned: string;
  dynamic: {
    id: string;
    asset: Token;
    reserveFactor: string;
    insuranceFactor: string;
  };
};

type VaultSnapshot = {
  cumulativeInterestEarned: string;
  vault: {
    id: string;
    asset: Token;
    protocolRate: string;
  };
};

type RepaymentOperation = {
  hash: string;
  currency: Token;
};

const NETWORKS: Partial<Record<string, NetworkConfig>> = {
  [CHAIN.ETHEREUM]: {
    network: "MAINNET",
    start: "2022-05-16",
    // Clearpool Prime repayment fee treasury on Ethereum; transfers are counted only when the tx also has a Repaid operation in Subsquid.
    repaymentFeeTreasury: "0x455011f2704c6E192b09d9CC1430299C70af3454",
  },
  [CHAIN.POLYGON]: { network: "POLYGON", start: "2022-07-22" },
  [CHAIN.POLYGON_ZKEVM]: { network: "ZKEVM", start: "2023-05-19" },
  [CHAIN.OPTIMISM]: { network: "OPTIMISM", start: "2023-07-20" },
  [CHAIN.ARBITRUM]: { network: "ARBITRUM", start: "2023-07-20" },
  [CHAIN.MANTLE]: { network: "MANTLE", start: "2023-09-01" },
  [CHAIN.AVAX]: {
    network: "AVALANCHE",
    start: "2024-01-01",
    // Clearpool Prime repayment fee treasury on Avalanche; transfers are counted only when the tx also has a Repaid operation in Subsquid.
    repaymentFeeTreasury: "0xe8D5AB73E8bA49f4a388AC04b6D4cbB045976915",
  },
  [CHAIN.BASE]: { network: "BASE", start: "2024-01-01" },
};

const toDate = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(0, 10);
const toBigInt = (value?: string | number | bigint | null) => BigInt(value?.toString().split(".")[0] ?? "0");

async function querySubgraph<T>(query: string, variables: Record<string, any>): Promise<T> {
  const { data } = await axios.post(ENDPOINT, { query, variables }, { timeout: 20_000 });
  if (data.errors?.length) throw new Error(data.errors.map((e: any) => e.message).join("; "));
  return data.data;
}

async function paginated<T>(field: string, query: string, variables: Record<string, any>): Promise<T[]> {
  const results: T[] = [];
  for (let offset = 0; ; offset += LIMIT) {
    const data = await querySubgraph<Record<string, T[]>>(query, { ...variables, offset, limit: LIMIT });
    const page = data[field] ?? [];
    results.push(...page);
    if (page.length < LIMIT) return results;
  }
}

const dynamicSnapshotQuery = `
  # Source: Clearpool Subsquid (${ENDPOINT}) dynamicPoolSnapshots.
  # cumulativeInterestEarned is differenced across day boundaries for gross borrower interest.
  # dynamic.reserveFactor + dynamic.insuranceFactor gives the ray-scaled protocol share.
  query DynamicSnapshots($network: Network!, $date: String!, $offset: Int!, $limit: Int!) {
    dynamicPoolSnapshots(
      where: { date_eq: $date, dynamic: { network_eq: $network } }
      orderBy: dynamic_id_ASC
      offset: $offset
      limit: $limit
    ) {
      cumulativeInterestEarned
      dynamic {
        id
        asset { address }
        reserveFactor
        insuranceFactor
      }
    }
  }
`;

const vaultSnapshotQuery = `
  # Source: Clearpool Subsquid (${ENDPOINT}) vaultsSnapshots.
  # cumulativeInterestEarned is differenced across day boundaries for gross borrower interest.
  # vault.protocolRate gives the ray-scaled protocol share.
  query VaultSnapshots($network: Network!, $date: String!, $offset: Int!, $limit: Int!) {
    vaultsSnapshots(
      where: { date_eq: $date, vault: { network_eq: $network } }
      orderBy: vault_id_ASC
      offset: $offset
      limit: $limit
    ) {
      cumulativeInterestEarned
      vault {
        id
        asset { address }
        protocolRate
      }
    }
  }
`;

const repaymentQuery = `
  # Source: Clearpool Subsquid (${ENDPOINT}) operations.
  # Repaid operation tx hashes identify which on-chain treasury transfers are repayment fees.
  # ERC20 Transfer logs are fetched separately from the DefiLlama indexer for configured fee treasuries.
  query Repayments($network: Network!, $from: BigInt!, $to: BigInt!, $offset: Int!, $limit: Int!) {
    operations(
      where: {
        type_eq: Repaid
        hash_isNull: false
        currency_isNull: false
        currency: { network_eq: $network }
        createdAt_gte: $from
        createdAt_lt: $to
      }
      orderBy: createdAt_ASC
      offset: $offset
      limit: $limit
    ) {
      hash
      currency { address }
    }
  }
`;

const addGrossBorrowerInterest = (
  balances: ReturnType<FetchOptions["createBalances"]>,
  revenue: ReturnType<FetchOptions["createBalances"]>,
  supplySide: ReturnType<FetchOptions["createBalances"]>,
  token: string,
  grossInterest: bigint,
  protocolRate: bigint,
) => {
  if (grossInterest <= 0n) return;
  // Snapshot source gives cumulative gross borrower interest; rate fields are ray-scaled protocol shares.
  const uncappedProtocolRevenue = grossInterest * protocolRate / RAY;
  const protocolRevenue = uncappedProtocolRevenue > grossInterest ? grossInterest : uncappedProtocolRevenue;
  const lenderRevenue = grossInterest - protocolRevenue;

  balances.add(token, grossInterest, METRIC.BORROW_INTEREST);
  if (protocolRevenue > 0n) revenue.add(token, protocolRevenue, METRIC.BORROW_INTEREST);
  if (lenderRevenue > 0n) supplySide.add(token, lenderRevenue, METRIC.BORROW_INTEREST);
};

const addRepaymentTreasuryFees = async (
  options: FetchOptions,
  config: NetworkConfig,
  dailyFees: ReturnType<FetchOptions["createBalances"]>,
  dailyRevenue: ReturnType<FetchOptions["createBalances"]>,
) => {
  if (!config.repaymentFeeTreasury) return;

  const repayments = await paginated<RepaymentOperation>("operations", repaymentQuery, {
    network: config.network,
    from: `${options.fromTimestamp * 1000}`,
    to: `${options.toTimestamp * 1000}`,
  });

  const repaymentTxs = new Set(repayments.map((op) => op.hash.toLowerCase()));
  if (!repaymentTxs.size) return;

  const tokens = Array.from(new Set(repayments.map((op) => op.currency.address.toLowerCase())));
  const treasuryTopic = ethers.zeroPadValue(config.repaymentFeeTreasury, 32);
  // On-chain source: only ERC20 transfers into configured fee treasuries from matched Repaid txs are counted.
  const transferLogs = await options.getLogs({
    targets: tokens,
    eventAbi: "event Transfer(address indexed from,address indexed to,uint256 value)",
    topics: [TRANSFER_TOPIC, null as any, treasuryTopic],
    entireLog: true,
    flatten: false,
    cacheInCloud: true,
  });

  transferLogs.forEach((logs: any[], index: number) => {
    const token = tokens[index];
    for (const log of logs) {
      const txHash = log.transactionHash?.toLowerCase();
      if (!txHash || !repaymentTxs.has(txHash)) continue;
      const amount = toBigInt(log.args?.value ?? log.data);
      if (amount <= 0n) continue;
      dailyFees.add(token, amount, METRIC.BORROW_INTEREST);
      dailyRevenue.add(token, amount, METRIC.BORROW_INTEREST);
    }
  });
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const config = NETWORKS[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (!config) return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const [startSnapshots, endSnapshots, startVaultSnapshots, endVaultSnapshots] = await Promise.all([
    paginated<DynamicSnapshot>("dynamicPoolSnapshots", dynamicSnapshotQuery, {
      network: config.network,
      date: toDate(options.fromTimestamp),
    }),
    paginated<DynamicSnapshot>("dynamicPoolSnapshots", dynamicSnapshotQuery, {
      network: config.network,
      date: toDate(options.toTimestamp),
    }),
    paginated<VaultSnapshot>("vaultsSnapshots", vaultSnapshotQuery, {
      network: config.network,
      date: toDate(options.fromTimestamp),
    }),
    paginated<VaultSnapshot>("vaultsSnapshots", vaultSnapshotQuery, {
      network: config.network,
      date: toDate(options.toTimestamp),
    }),
  ]);

  const startDynamic = new Map(startSnapshots.map((snapshot: DynamicSnapshot) => [snapshot.dynamic.id, snapshot]));
  for (const end of endSnapshots) {
    const start = startDynamic.get(end.dynamic.id);
    if (!start) continue;
    const interest = toBigInt(end.cumulativeInterestEarned) - toBigInt(start.cumulativeInterestEarned);
    const protocolRate = toBigInt(end.dynamic.reserveFactor) + toBigInt(end.dynamic.insuranceFactor);
    addGrossBorrowerInterest(dailyFees, dailyRevenue, dailySupplySideRevenue, end.dynamic.asset.address, interest, protocolRate);
  }

  const startVaults = new Map(startVaultSnapshots.map((snapshot: VaultSnapshot) => [snapshot.vault.id, snapshot]));
  for (const end of endVaultSnapshots) {
    const start = startVaults.get(end.vault.id);
    if (!start) continue;
    const interest = toBigInt(end.cumulativeInterestEarned) - toBigInt(start.cumulativeInterestEarned);
    addGrossBorrowerInterest(dailyFees, dailyRevenue, dailySupplySideRevenue, end.vault.asset.address, interest, toBigInt(end.vault.protocolRate));
  }

  await addRepaymentTreasuryFees(options, config, dailyFees, dailyRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(Object.entries(NETWORKS).flatMap(([chain, config]) => config ? [[
    chain,
    {
      fetch,
      start: config.start,
    },
  ]] : [])),
  methodology: {
    Fees: "Interest and protocol fees generated by Clearpool lending products: Dynamic pools, Credit Vaults, and repayment fee treasury inflows.",
    Revenue: "Protocol share of Dynamic pool and Credit Vault borrower interest, based on reserve/insurance factors and vault protocol rates, plus repayment fee treasury inflows.",
    ProtocolRevenue: "Same as revenue.",
    SupplySideRevenue: "Interest distributed to lenders. Repayment treasury inflows are protocol revenue only.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Daily change in cumulative interest for Dynamic pools and Credit Vaults, plus ERC20 transfers into configured fee treasuries in transactions with a Repaid operation.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Dynamic pool reserve plus insurance factors, Credit Vault protocol rates, and configured fee treasury inflows from repayment transactions.",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "Dynamic pool reserve plus insurance factors, Credit Vault protocol rates, and configured fee treasury inflows from repayment transactions.",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Remaining lender interest after protocol share; repayment fee treasury inflows are excluded from supply-side.",
    },
  },
};

export default adapter;
