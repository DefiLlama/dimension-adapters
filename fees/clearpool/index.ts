import axios from "axios";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Clearpool public Subsquid GraphQL endpoint used for pool/vault snapshots and repayment operations.
const ENDPOINT = "https://squid.subsquid.io/cpool-squid/v/v1/graphql";
const RAY = 10n ** 18n;
const LIMIT = 500;
const PRIME_POOL_CREATED_EVENT = "event PoolCreated(address pool, address indexed borrower, bool isBulletLoan, address indexed asset, uint256 size, uint256 rateMantissa, uint256 tenor, uint256 depositWindow, uint256 spreadRate, uint256 originationRate, uint256 incrementPerRoll, uint256 penaltyRatePerYear)";
const PRIME_REPAYED_EVENT = "event Repayed(address indexed lender, uint256 repayed, uint256 spreadFee, uint256 originationFee, uint256 penalty)";
const PRIME_REPAYMENT_FEES = "Prime Repayment Fees";

type NetworkConfig = {
  network: string;
  start: string;
  primeFactory?: string;
  primeFromBlock?: number;
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

// Prime factory addresses and fromBlock values match the existing Clearpool TVL factory config.
const NETWORKS: Partial<Record<string, NetworkConfig>> = {
  [CHAIN.ETHEREUM]: {
    network: "MAINNET",
    start: "2022-05-16",
    // Clearpool Prime factory on Ethereum; PoolCreated logs expose pool and asset for repayment scans.
    primeFactory: "0x83D5c08eCfe3F711e1Ff34618c0Dcc5FeFBe1791",
    primeFromBlock: 17577233, // 2023-06-28
  },
  [CHAIN.POLYGON]: { network: "POLYGON", start: "2022-07-25" },
  [CHAIN.POLYGON_ZKEVM]: { network: "ZKEVM", start: "2023-05-19" },
  [CHAIN.OPTIMISM]: {
    network: "OPTIMISM",
    start: "2023-07-20",
    // Clearpool Prime factory on Optimism; PoolCreated logs expose pool and asset for repayment scans.
    primeFactory: "0xe3E26D4187f3A8e100223576a37d30f2A89eb755",
    primeFromBlock: 112307797, // 2023-11-17
  },
  [CHAIN.ARBITRUM]: {
    network: "ARBITRUM",
    start: "2023-07-20",
    // Clearpool Prime factory on Arbitrum; PoolCreated logs expose pool and asset for repayment scans.
    primeFactory: "0x44fEF0fAB3A96CA34b06d5142350Ef9223F65A7e",
    primeFromBlock: 226174706, // 2024-06-27
  },
  [CHAIN.MANTLE]: {
    network: "MANTLE",
    start: "2024-01-23",
    // Clearpool Prime factory on Mantle; PoolCreated logs expose pool and asset for repayment scans.
    primeFactory: "0x29157e2B6A34Ae1787CDdD05Ad54DD4aa9783A5c",
    primeFromBlock: 68483768, // 2024-08-31
  },
  [CHAIN.AVAX]: {
    network: "AVALANCHE",
    start: "2024-03-07",
    // Clearpool Prime factory on Avalanche; PoolCreated logs expose pool and asset for repayment scans.
    primeFactory: "0x7A05280940A23749106D8Fb2cA4b10B9D1C89067",
    primeFromBlock: 45264014, // 2024-05-10
  },
  [CHAIN.BASE]: {
    network: "BASE",
    start: "2024-01-01",
    // Clearpool Prime factory on Base; PoolCreated logs expose pool and asset for repayment scans.
    primeFactory: "0xBdf5575Ec1cC0a14Bd3e94648a2453fdC7B56943",
    primeFromBlock: 12453163, // 2024-03-29
  },
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

// Source: Clearpool Subsquid dynamicPoolSnapshots.
// cumulativeInterestEarned is differenced across day boundaries for gross borrower interest.
// dynamic.reserveFactor + dynamic.insuranceFactor gives the ray-scaled protocol share.
const dynamicSnapshotQuery = `
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

// Source: Clearpool Subsquid vaultsSnapshots.
// cumulativeInterestEarned is differenced across day boundaries for gross borrower interest.
// vault.protocolRate gives the ray-scaled protocol share.
const vaultSnapshotQuery = `
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

const addPrimeRepaymentFees = async (
  options: FetchOptions,
  config: NetworkConfig,
  dailyFees: ReturnType<FetchOptions["createBalances"]>,
  dailyRevenue: ReturnType<FetchOptions["createBalances"]>,
) => {
  if (!config.primeFactory || !config.primeFromBlock) return;

  // On-chain source: Prime factory PoolCreated logs discover pool addresses and assets.
  const primePools: any[] = await options.getLogs({
    target: config.primeFactory,
    fromBlock: config.primeFromBlock,
    eventAbi: PRIME_POOL_CREATED_EVENT,
    cacheInCloud: true,
  });
  if (!primePools.length) return;

  const poolAssets = Object.fromEntries(primePools.map((pool) => [pool.pool.toLowerCase(), pool.asset]));
  const repaymentLogs: any[] = await options.getLogs({
    targets: Object.keys(poolAssets),
    eventAbi: PRIME_REPAYED_EVENT,
    entireLog: true,
    cacheInCloud: true,
  });

  for (const repayment of repaymentLogs) {
    const token = poolAssets[repayment.address?.toLowerCase()];
    if (!token) continue;
    const args = repayment.args ?? repayment;
    const fee = toBigInt(args.spreadFee) + toBigInt(args.originationFee) + toBigInt(args.penalty);
    if (fee <= 0n) continue;
    dailyFees.add(token, fee, PRIME_REPAYMENT_FEES);
    dailyRevenue.add(token, fee, PRIME_REPAYMENT_FEES);
  }
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

  await addPrimeRepaymentFees(options, config, dailyFees, dailyRevenue);

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
    Fees: "Interest and protocol fees generated by Clearpool lending products: Dynamic pools, Credit Vaults, and Prime pool repayment fees.",
    Revenue: "Protocol share of Dynamic pool and Credit Vault borrower interest, based on reserve/insurance factors and vault protocol rates, plus Prime pool repayment fees.",
    ProtocolRevenue: "Same as revenue.",
    SupplySideRevenue: "Interest distributed to lenders. Prime pool repayment fees are protocol revenue only.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Daily change in cumulative interest for Dynamic pools and Credit Vaults.",
      [PRIME_REPAYMENT_FEES]: "Prime pool fees from Repayed events on pools discovered from factory PoolCreated events.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Dynamic pool reserve plus insurance factors and Credit Vault protocol rates.",
      [PRIME_REPAYMENT_FEES]: "Prime pool repayment fees from spreadFee, originationFee, and penalty fields.",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "Dynamic pool reserve plus insurance factors and Credit Vault protocol rates.",
      [PRIME_REPAYMENT_FEES]: "Prime pool repayment fees from spreadFee, originationFee, and penalty fields.",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Remaining lender interest after protocol share; Prime repayment fees are excluded from supply-side.",
    },
  },
};

export default adapter;
