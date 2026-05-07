import axios from "axios";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const ENDPOINT = "https://squid.subsquid.io/cpool-squid/v/v1/graphql";
const RAY = 10n ** 18n;
const LIMIT = 500;
const PRIME_POOL_CREATED_EVENT = "event PoolCreated(address pool, address indexed borrower, bool isBulletLoan, address indexed asset, uint256 size, uint256 rateMantissa, uint256 tenor, uint256 depositWindow, uint256 spreadRate, uint256 originationRate, uint256 incrementPerRoll, uint256 penaltyRatePerYear)";
const PRIME_REPAYED_EVENT = "event Repayed(address indexed lender, uint256 repayed, uint256 spreadFee, uint256 originationFee, uint256 penalty)";
const PRIME_REPAYMENT_FEES = "Prime Repayment Fees";

const chainConfig: any = {
  [CHAIN.ETHEREUM]: {
    network: "MAINNET",
    start: "2022-05-16",
    primeFactory: "0x83D5c08eCfe3F711e1Ff34618c0Dcc5FeFBe1791",
    primeFromBlock: 17577233,
  },
  [CHAIN.POLYGON]: { network: "POLYGON", start: "2022-07-25" },
  [CHAIN.POLYGON_ZKEVM]: { network: "ZKEVM", start: "2023-05-19" },
  [CHAIN.OPTIMISM]: {
    network: "OPTIMISM",
    start: "2023-07-20",
    primeFactory: "0xe3E26D4187f3A8e100223576a37d30f2A89eb755",
    primeFromBlock: 112307797,
  },
  [CHAIN.ARBITRUM]: {
    network: "ARBITRUM",
    start: "2023-07-20",
    primeFactory: "0x44fEF0fAB3A96CA34b06d5142350Ef9223F65A7e",
    primeFromBlock: 226174706,
  },
  [CHAIN.MANTLE]: {
    network: "MANTLE",
    start: "2024-01-23",
    primeFactory: "0x29157e2B6A34Ae1787CDdD05Ad54DD4aa9783A5c",
    primeFromBlock: 68483768,
  },
  [CHAIN.AVAX]: {
    network: "AVALANCHE",
    start: "2024-03-07",
    primeFactory: "0x7A05280940A23749106D8Fb2cA4b10B9D1C89067",
    primeFromBlock: 45264014,
  },
  [CHAIN.BASE]: {
    network: "BASE",
    start: "2024-01-01",
    primeFactory: "0xBdf5575Ec1cC0a14Bd3e94648a2453fdC7B56943",
    primeFromBlock: 12453163,
  },
};

const toBigInt = (value: any) => BigInt(value?.toString().split(".")[0] ?? "0");

async function querySubgraph(query: any, variables: any) {
  const { data } = await axios.post(ENDPOINT, { query, variables }, { timeout: 20_000 });
  if (data.errors?.length) throw new Error(data.errors.map((e: any) => e.message).join("; "));
  return data.data;
}

async function paginated(field: any, query: any, variables: any) {
  const results = [];
  for (let offset = 0; ; offset += LIMIT) {
    const data = await querySubgraph(query, { ...variables, offset, limit: LIMIT });
    const page = data[field] ?? [];
    results.push(...page);
    if (page.length < LIMIT) return results;
  }
}

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
      }
    }
  }
`;

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
  balances: any,
  revenue: any,
  supplySide: any,
  token: string,
  grossInterest: bigint,
  protocolRate: bigint,
) => {
  const interest = BigInt(grossInterest);
  const rate = BigInt(protocolRate);
  if (interest <= 0n) return;
  const uncappedProtocolRevenue = interest * rate / RAY;
  const protocolRevenue = uncappedProtocolRevenue > interest ? interest : uncappedProtocolRevenue;
  const lenderRevenue = interest - protocolRevenue;

  balances.add(token, interest, METRIC.BORROW_INTEREST);
  if (protocolRevenue > 0n) revenue.add(token, protocolRevenue, METRIC.BORROW_INTEREST);
  if (lenderRevenue > 0n) supplySide.add(token, lenderRevenue, METRIC.BORROW_INTEREST);
};

const addPrimeRepaymentFees = async (
  options: any,
  config: any,
  dailyFees: any,
  dailyRevenue: any,
  dailySupplySideRevenue: any,
) => {
  if (!config.primeFactory || !config.primeFromBlock) return;

  const primePools = await options.getLogs({
    target: config.primeFactory,
    fromBlock: config.primeFromBlock,
    eventAbi: PRIME_POOL_CREATED_EVENT,
    cacheInCloud: true,
  });
  if (!primePools.length) return;

  const poolAssets = Object.fromEntries(primePools.map((pool: any) => [pool.pool.toLowerCase(), pool.asset]));
  const repaymentLogs = await options.getLogs({
    targets: Object.keys(poolAssets),
    eventAbi: PRIME_REPAYED_EVENT,
    entireLog: true,
    cacheInCloud: true,
  });

  for (const repayment of repaymentLogs) {
    const token = poolAssets[repayment.address?.toLowerCase()];
    if (!token) continue;
    const args = repayment.args ?? repayment;
    const protocolFee = toBigInt(args.spreadFee) + toBigInt(args.originationFee);
    const penalty = toBigInt(args.penalty);
    const totalFee = protocolFee + penalty;
    if (totalFee <= 0n) continue;
    dailyFees.add(token, totalFee, PRIME_REPAYMENT_FEES);
    if (protocolFee > 0n) dailyRevenue.add(token, protocolFee, PRIME_REPAYMENT_FEES);
    if (penalty > 0n) dailySupplySideRevenue.add(token, penalty, PRIME_REPAYMENT_FEES);
  }
};

async function fetch(options: any) {
  const config = chainConfig[options.chain];

  try {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const from = new Date(options.fromTimestamp * 1000).toISOString().slice(0, 10);
    const to = new Date(options.toTimestamp * 1000).toISOString().slice(0, 10);

    const [startSnapshots, endSnapshots, startVaultSnapshots, endVaultSnapshots] = await Promise.all([
      paginated("dynamicPoolSnapshots", dynamicSnapshotQuery, {
        network: config.network,
        date: from,
      }),
      paginated("dynamicPoolSnapshots", dynamicSnapshotQuery, {
        network: config.network,
        date: to,
      }),
      paginated("vaultsSnapshots", vaultSnapshotQuery, {
        network: config.network,
        date: from,
      }),
      paginated("vaultsSnapshots", vaultSnapshotQuery, {
        network: config.network,
        date: to,
      }),
    ]);

    const startDynamic = new Map(startSnapshots.map((snapshot: any) => [snapshot.dynamic.id, snapshot]));
    for (const end of endSnapshots) {
      const start = startDynamic.get(end.dynamic.id);
      if (!start) continue;
      const interest = toBigInt(end.cumulativeInterestEarned) - toBigInt(start.cumulativeInterestEarned);
      const protocolRate = toBigInt(end.dynamic.reserveFactor);
      addGrossBorrowerInterest(dailyFees, dailyRevenue, dailySupplySideRevenue, end.dynamic.asset.address, interest, protocolRate);
    }

    const startVaults = new Map(startVaultSnapshots.map((snapshot: any) => [snapshot.vault.id, snapshot]));
    for (const end of endVaultSnapshots) {
      const start = startVaults.get(end.vault.id);
      if (!start) continue;
      const interest = toBigInt(end.cumulativeInterestEarned) - toBigInt(start.cumulativeInterestEarned);
      addGrossBorrowerInterest(dailyFees, dailyRevenue, dailySupplySideRevenue, end.vault.asset.address, interest, toBigInt(end.vault.protocolRate));
    }

    await addPrimeRepaymentFees(options, config, dailyFees, dailyRevenue, dailySupplySideRevenue);

    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  } catch (error) {
    console.error(`[clearpool][${options.chain}] fetch failed`, error);
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
  }
}

const adapter = {
  version: 2,
  fetch,
  pullHourly: true,
  adapter: chainConfig,
  methodology: {
    Fees: "Interest and protocol fees generated by Clearpool lending products: Dynamic pools, Credit Vaults, and Prime pool repayment fees.",
    Revenue: "Protocol share of Dynamic pool and Credit Vault borrower interest, plus Prime pool spreadFee and originationFee repayment fees; Prime pool penalty amounts are excluded from revenue and booked to dailySupplySideRevenue.",
    ProtocolRevenue: "Same as revenue.",
    SupplySideRevenue: "Interest distributed to lenders, plus Prime pool repayment penalties not retained as protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Daily change in cumulative interest for Dynamic pools and Credit Vaults.",
      [PRIME_REPAYMENT_FEES]: "Prime pool fees from Repayed events on pools discovered from factory PoolCreated events.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Dynamic pool reserve factors and Credit Vault protocol rates.",
      [PRIME_REPAYMENT_FEES]: "Prime pool repayment spreadFee and originationFee retained by the protocol.",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "Dynamic pool reserve factors and Credit Vault protocol rates.",
      [PRIME_REPAYMENT_FEES]: "Prime pool repayment spreadFee and originationFee retained by the protocol.",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Remaining lender interest after protocol share.",
      [PRIME_REPAYMENT_FEES]: "Prime pool repayment penalties not retained as protocol revenue.",
    },
  },
};

export default adapter;
