import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * ssv.network — Distributed Validator Technology (DVT)
 *
 * Since the April 2026 migration (SSV Staking / cSSV launch), validator fees are
 * denominated and paid in ETH (previously SSV). Stakers running validators pay:
 *   - Operator fees
 *   - Network fee
 *
 * Network fees no longer go to the DAO treasury; 100% accrue to cSSV holders
 */
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

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // --- Network fees (ETH) distributed to cSSV stakers ---
  // Sum the exact amount synced into the staking reward pool over the period.
  const feeLogs = await options.getLogs({ target: SSV_NETWORK, eventAbi: FEES_SYNCED_ABI });
  let networkFeesWei = BigInt(0);
  for (const log of feeLogs) networkFeesWei += BigInt(log.newFeesWei);

  // --- Operator fees (ETH) earned by node operators ---
  // Per-block operator fee = sum over operators of (ethFee * ethValidatorCount).
  // Multiply by the number of blocks in the period to get the period total.
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

  dailyFees.addGasToken(networkFeesWei, "Network Fees");
  dailyFees.addGasToken(operatorFeesWei, "Operator Fees");
  dailyRevenue.addGasToken(networkFeesWei, "Network Fees To cSSV Stakers");
  dailyHoldersRevenue.addGasToken(networkFeesWei, "Network Fees To cSSV Stakers");
  dailySupplySideRevenue.addGasToken(operatorFeesWei, "Operator Fees To Operators");

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total ETH fees paid by stakers running validators on ssv.network: network fees (set by the DAO) plus operator fees (set by each operator in a free market). Charged per block against each cluster's ETH balance.",
  Revenue: "Network fees which are the protocol's share of validator fees.",
  HoldersRevenue: "Network fees distributed in ETH to cSSV stakers.",
  SupplySideRevenue: "Operator fees earned by node operators running the distributed validator infrastructure.",
};

const breakdownMethodology = {
  Fees: {
    "Network Fees": "ETH network fee charged per validator/block, set by the SSV DAO.",
    "Operator Fees": "ETH operator fees charged per validator/block, set by each operator.",
  },
  Revenue: {
    "Network Fees To cSSV Stakers": "Network fees collected by the protocol.",
  },
  HoldersRevenue: {
    "Network Fees To cSSV Stakers": "Network fees distributed in ETH to cSSV stakers.",
  },
  SupplySideRevenue: {
    "Operator Fees To Operators": "Operator fees paid in ETH to node operators.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-04-22", // ETH-denominated fee migration
  methodology,
  breakdownMethodology,
};

export default adapter;
