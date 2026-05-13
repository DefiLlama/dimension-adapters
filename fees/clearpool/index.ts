import axios from "axios";
import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const ENDPOINT = "https://squid.subsquid.io/cpool-squid/v/v1/graphql";
const PORT_ENDPOINT = "https://vaults.clearpool.finance/api/subsquid";
const PORT_HEADERS = {
  origin: "https://vaults.clearpool.finance",
  referer: "https://vaults.clearpool.finance/",
  accept: "application/graphql-response+json, application/json",
};
const WAD = 10n ** 18n;
const LIMIT = 500;
const PRIME_POOL_CREATED_EVENT = "event PoolCreated(address pool, address indexed borrower, bool isBulletLoan, address indexed asset, uint256 size, uint256 rateMantissa, uint256 tenor, uint256 depositWindow, uint256 spreadRate, uint256 originationRate, uint256 incrementPerRoll, uint256 penaltyRatePerYear)";
const PRIME_REPAYED_EVENT = "event Repayed(address indexed lender, uint256 repayed, uint256 spreadFee, uint256 originationFee, uint256 penalty)";

const chainConfig: any = {
  [CHAIN.ETHEREUM]: {
    network: "MAINNET",
    start: "2022-05-16",
    primeFactory: "0x83D5c08eCfe3F711e1Ff34618c0Dcc5FeFBe1791",
    primeFromBlock: 17577233,
    portVaults: [
      { id: "0x455bdfb7db8739fb3da683914e44928e9f0edf91-MAINNET", address: "0x455bdfb7db8739fb3da683914e44928e9f0edf91", token: "0xf8750b54d86be7ae9e32b4a0c826811198d63313" },
    ],
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
  [CHAIN.FLARE]: {
    start: "2025-10-28",
    portVaults: [
      { id: "0x6b9e9d89e0e9fd93eb95d8c7715be2a8de64af07-FLARE", address: "0x6b9e9d89e0e9fd93eb95d8c7715be2a8de64af07", token: "0x4a771cc1a39fdd8aa08b8ea51f7fd412e73b3d2b" },
    ],
  },
};

const toBigInt = (value: any) => BigInt(value?.toString().split(".")[0] ?? "0");
const gql = (url: string, headers = {}) => (query: string, variables: any, field: string) =>
  axios.post(url, { query, variables: { ...variables, limit: LIMIT } }, { headers, timeout: 20_000 }).then(({ data }) => data.data[field] ?? []);
const subgraph = gql(ENDPOINT);
const portGql = gql(PORT_ENDPOINT, PORT_HEADERS);

const dynamicSnapshotQuery = `
  query DynamicSnapshots($network: Network!, $date: String!, $limit: Int!) {
    dynamicPoolSnapshots(
      where: { date_eq: $date, dynamic: { network_eq: $network } }
      orderBy: dynamic_id_ASC
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

const portNavQuery = `
  query PortNavUpdates($ids: [String!], $from: BigInt!, $to: BigInt!, $limit: Int!) {
    portNavUpdates(
      where: { vault: { id_in: $ids }, timestamp_gte: $from, timestamp_lt: $to }
      orderBy: timestamp_ASC
      limit: $limit
    ) {
      oldRate
      newRate
      block
      vault { id }
    }
  }
`;

async function fetch(_a: any, _b: any, options: any) {
  const config = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const from = options.dateString;
  const to = new Date(options.endTimestamp * 1000).toISOString().slice(0, 10);

  if (config.network) {
    const snap = (query: string, field: string, date: string) => subgraph(query, { network: config.network, date }, field);
    const [startDynamicSnapshots, endDynamicSnapshots] = await Promise.all([
      snap(dynamicSnapshotQuery, "dynamicPoolSnapshots", from),
      snap(dynamicSnapshotQuery, "dynamicPoolSnapshots", to),
    ]);
    const startDynamicById = Object.fromEntries(startDynamicSnapshots.map((snapshot: any) => [snapshot.dynamic.id, snapshot]));

    for (const endDynamic of endDynamicSnapshots) {
      const startDynamic = startDynamicById[endDynamic.dynamic.id];
      if (!startDynamic) continue;
      const interest = toBigInt(endDynamic.cumulativeInterestEarned) - toBigInt(startDynamic.cumulativeInterestEarned);
      if (interest <= 0n) continue;
      const protocolRevenue = interest * toBigInt(endDynamic.dynamic.reserveFactor) / WAD;
      dailyFees.add(endDynamic.dynamic.asset.address, interest, METRIC.BORROW_INTEREST);
      dailyRevenue.add(endDynamic.dynamic.asset.address, protocolRevenue, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.add(endDynamic.dynamic.asset.address, interest - protocolRevenue, METRIC.BORROW_INTEREST);
    }
  }

  if (config.primeFactory) {
    const primePools = await options.getLogs({
      target: config.primeFactory,
      fromBlock: config.primeFromBlock,
      eventAbi: PRIME_POOL_CREATED_EVENT,
      cacheInCloud: true,
    });
    if (primePools.length) {
      const poolAssets = Object.fromEntries(primePools.map((pool: any) => [pool.pool.toLowerCase(), pool.asset]));
      const repaymentLogs = await options.getLogs({
        targets: Object.keys(poolAssets),
        eventAbi: PRIME_REPAYED_EVENT,
        entireLog: true,
        cacheInCloud: true,
      });

      for (const repayment of repaymentLogs) {
        const token = poolAssets[repayment.address?.toLowerCase()];
        const args = repayment.args ?? repayment;
        const protocolFee = toBigInt(args.spreadFee) + toBigInt(args.originationFee);
        const penalty = toBigInt(args.penalty);
        if (!token || protocolFee + penalty <= 0n) continue;
        dailyFees.add(token, protocolFee, METRIC.PROTOCOL_FEES);
        dailyRevenue.add(token, protocolFee, METRIC.PROTOCOL_FEES);
        dailyFees.add(token, penalty, METRIC.BORROW_INTEREST);
        dailySupplySideRevenue.add(token, penalty, METRIC.BORROW_INTEREST);
      }
    }
  }

  if (config.portVaults) {
    const portVaultById = Object.fromEntries(config.portVaults.map((vault: any) => [vault.id, vault]));
    const navUpdates = await portGql(portNavQuery, {
      ids: config.portVaults.map((vault: any) => vault.id),
      from: (BigInt(options.startTimestamp) * 1000n).toString(),
      to: (BigInt(options.endTimestamp) * 1000n).toString(),
    }, "portNavUpdates");
    const navFees = await Promise.all(navUpdates.map(async (update: any) => {
      const vault = portVaultById[update.vault.id];
      const supply = await sdk.api2.abi.call({
        chain: options.chain,
        target: vault.address,
        abi: "uint256:totalSupply",
        block: Number(update.block),
      });
      return { vault, amount: toBigInt(supply) * (toBigInt(update.newRate) - toBigInt(update.oldRate)) / WAD };
    }));

    for (const { vault, amount } of navFees) {
      if (amount === 0n) continue;
      dailyFees.add(vault.token, amount, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(vault.token, amount, METRIC.ASSETS_YIELDS);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  allowNegativeValue: true,
  methodology: {
    Fees: "Interest and protocol fees generated by Clearpool lending products: Dynamic pools, Prime pool repayment fees, and Port vault NAV yield.",
    Revenue: "Protocol share of Dynamic pool borrower interest, plus Prime pool spreadFee and originationFee repayment fees.",
    ProtocolRevenue: "Protocol share of Dynamic pool borrower interest, plus Prime pool spreadFee and originationFee repayment fees.",
    SupplySideRevenue: "Interest distributed to lenders, Prime pool repayment penalties to lenders, and Port vault NAV yield accruing to depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Daily change in cumulative interest for Dynamic pools, plus Prime penalty interest paid to lenders.",
      [METRIC.PROTOCOL_FEES]: "Prime pool spreadFee and originationFee from Repayed events.",
      [METRIC.ASSETS_YIELDS]: "Port vault NAV updates over active shares.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Dynamic pool reserve factors.",
      [METRIC.PROTOCOL_FEES]: "Prime pool repayment spreadFee and originationFee retained by the protocol.",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "Dynamic pool reserve factors.",
      [METRIC.PROTOCOL_FEES]: "Prime pool repayment spreadFee and originationFee retained by the protocol.",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Remaining lender interest after protocol share, plus Prime penalty interest paid to lenders.",
      [METRIC.ASSETS_YIELDS]: "Port vault NAV yield accruing to depositors.",
    },
  },
};

export default adapter;
