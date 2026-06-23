import { request } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

/**
 * ssv.network — Distributed Validator Technology (DVT)
 *
 * Validator fees have two eras, so the adapter switches source by date:
 *  - Before the April 2026 SSV Staking / cSSV migration, fees were denominated in SSV and tracked by the ssv-fee-tracker subgraph (legacy path below).
 *  - After the migration, fees are denominated and paid in ETH. Network fees no longer go to the DAO treasury; 100% accrue to cSSV stakers
 *
 * The first FeesSynced event lands at ~block 24,961,012 (≈ 2026-04-22), which is the boundary used to choose the data source.
 */
const MIGRATION_TIMESTAMP = Date.UTC(2026, 3, 22) / 1000; // 2026-04-22 00:00 UTC

// --- Legacy ---
const SUBGRAPH = "https://api.studio.thegraph.com/query/88140/ssv-fee-tracker/version/latest";
const SSV_COINGECKO_ID = "ssv-network";
const SSV_TOKEN = "0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Burn (zero) address, padded to a 32-byte topic for the `to` filter.
const PADDED_BURN_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000000";
const weiToSSV = (amount: string): number => Number(amount || "0") / 1e18;

// --- Current ---
const SSV_NETWORK = "0xDD9BC35aE942eF0cFa76930954a156B3fF30a4E1";
const SSV_VIEWS = "0xafE830B6Ee262ba11cce5F32fDCd760FFE6a66e4";
// keccak256("ssv.network.storage.main")
const LAST_OPERATOR_ID_SLOT = "0xd56c4f4aab8ca22f9fde432777379f436593c6027698a6995e2daea890bed10c";
const MAX_OPERATOR_ID_FALLBACK = 5000;
// Emitted by SSVStaking._syncFees: newFeesWei = ETH network fees accrued to the
// staking pool (cSSV holders) since the previous sync.
const FEES_SYNCED_ABI = "event FeesSynced(uint256 newFeesWei, uint256 accEthPerShare)";
const GET_OPERATOR_ABI =
  "function getOperatorById(uint64 operatorId) view returns (address owner, uint256 fee, uint32 validatorCount, address whitelisted, bool isPrivate, bool isActive)";

const fetchLegacy = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;

  const dateString = new Date(options.startOfDay * 1000).toISOString().split("T")[0];

  const query = `
    query GetSSVDailyFees {
      dailyProtocolStats(id: "${dateString}") {
        id
        date
        dailyTotalFeesIncrease
        dailyOperatorEarningsIncrease
        dailyNetworkEarningsIncrease
      }
    }
  `;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  const result = await request(SUBGRAPH, query);
  const data = result.dailyProtocolStats;

  if (data) {
    const totalFees = weiToSSV(data.dailyTotalFeesIncrease);
    const networkRevenue = weiToSSV(data.dailyNetworkEarningsIncrease);
    const operatorRevenue = weiToSSV(data.dailyOperatorEarningsIncrease);

    dailyFees.addCGToken(SSV_COINGECKO_ID, totalFees, "Validator Operation Fees");
    dailyRevenue.addCGToken(SSV_COINGECKO_ID, networkRevenue, "DAO Treasury Allocation");
    dailySupplySideRevenue.addCGToken(SSV_COINGECKO_ID, operatorRevenue, METRIC.OPERATORS_FEES);
  }

  const burnLogs = await getLogs({
    target: SSV_TOKEN,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [TRANSFER_TOPIC, null as any, PADDED_BURN_ADDRESS],
  });
  for (const log of burnLogs) {
    dailyHoldersRevenue.add(SSV_TOKEN, log.value, "Token Burns");
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const fetchOnchain = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const feeLogs = await options.getLogs({ target: SSV_NETWORK, eventAbi: FEES_SYNCED_ABI });
  let networkFeesWei = BigInt(0);
  for (const log of feeLogs) networkFeesWei += BigInt(log.newFeesWei);

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const periodBlocks = BigInt(Math.max(0, toBlock - fromBlock));

  let lastOperatorId = MAX_OPERATOR_ID_FALLBACK;
  try {
    const raw = await options.toApi.provider.getStorage(SSV_NETWORK, LAST_OPERATOR_ID_SLOT, toBlock);
    const parsed = Number(BigInt(raw));
    if (parsed > 0 && parsed < 1_000_000) lastOperatorId = parsed;
  } catch (_) { }

  const operatorIds = Array.from({ length: lastOperatorId }, (_, i) => i + 1);
  const operators = await options.toApi.multiCall({
    abi: GET_OPERATOR_ABI,
    target: SSV_VIEWS,
    calls: operatorIds.map((id) => ({ params: [id] })),
    permitFailure: true,
  });

  let operatorFeePerBlock = BigInt(0);
  for (const op of operators) {
    if (!op) continue;
    operatorFeePerBlock += BigInt(op.fee || 0) * BigInt(op.validatorCount || 0);
  }
  const operatorFeesWei = operatorFeePerBlock * periodBlocks;

  dailyFees.addGasToken(networkFeesWei + operatorFeesWei, "Validator Operation Fees");
  dailyRevenue.addGasToken(networkFeesWei, "Network Fees To cSSV Stakers");
  dailyHoldersRevenue.addGasToken(networkFeesWei, "Network Fees To cSSV Stakers");
  dailySupplySideRevenue.addGasToken(operatorFeesWei, METRIC.OPERATORS_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const fetch = async (options: FetchOptions) => {
  return options.startOfDay >= MIGRATION_TIMESTAMP
    ? fetchOnchain(options)
    : fetchLegacy(options);
};

const methodology = {
  Fees: "Total validator fees on ssv.network: network fee (set by the DAO) plus operator fees (set by each operator in a free market). Denominated in SSV before the April 2026 SSV Staking / cSSV migration and in ETH after it.",
  UserFees: "Pre-migration metric: fees paid by stakers running validators (operator + network fees), equal to total Fees. SSV-denominated.",
  Revenue: "Network fees, the protocol's share of validator fees. Pre-migration these accrued to the DAO treasury, post-migration they are distributed to cSSV stakers.",
  ProtocolRevenue: "Pre-migration metric: network fees allocated to the SSV DAO treasury. Not applicable after the migration, when network fees go to cSSV stakers instead.",
  SupplySideRevenue: "Operator fees earned by node operators running the distributed validator infrastructure (SSV-denominated pre-migration, ETH after).",
  HoldersRevenue: "Value accruing to holders: SSV token burns pre-migration; ETH network fees distributed to cSSV stakers post-migration.",
};

const breakdownMethodology = {
  Fees: {
    "Validator Operation Fees": "Pre-migration: total SSV fees paid by validators (operator + network fees).",
  },
  UserFees: {
    "Validator Operation Fees": "Pre-migration: total SSV fees paid by validators (operator + network fees).",
  },
  Revenue: {
    "DAO Treasury Allocation": "Pre-migration: network fees allocated to the SSV DAO treasury.",
    "Network Fees To cSSV Stakers": "Post-migration: network fees collected by the protocol.",
  },
  ProtocolRevenue: {
    "DAO Treasury Allocation": "Pre-migration: network fees allocated to the SSV DAO treasury.",
  },
  SupplySideRevenue: {
    [METRIC.OPERATORS_FEES]: "Pre-migration: SSV fees earned by node operators (market-determined per validator).",
  },
  HoldersRevenue: {
    "Token Burns": "Pre-migration: SSV tokens burned to the zero address.",
    "Network Fees To cSSV Stakers": "Post-migration: network fees distributed in ETH to cSSV stakers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2023-06-18",
  methodology,
  breakdownMethodology,
  pullHourly: false, //legacy subgraph does not support hourly data
};

export default adapter;
