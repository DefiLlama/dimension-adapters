import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// PAIR Protocol — permissionless tokenized-equity launchpad on Robinhood Chain.
// Docs: https://pair.fund/docs
const PAIR_V4_LOCKER = "0xeFcF476E8870fB3eb8680f039414fdcCE6C2a117";
const LAUNCHPAD = "0x8660A7F019C7943b0b0A91B8E39AFf3b6DB6Ae62";

const LAUNCH_FEE_WEI = 500_000_000_000_000n;

const FEES_ALLOCATED_ABI =
  "event FeesAllocated(uint256 indexed tokenId, address indexed asset, uint256 creatorFee, uint256 protocolFee)";

const PAIR_POOL_CREATED_ABI =
  "event PairPoolCreated(address indexed projectToken, address indexed quoteToken, bytes32 indexed poolId, uint256 positionId, uint16 weightBps, uint256 projectTokenAmount, int24 tickLower, int24 tickUpper, uint160 initialSqrtPriceX96, uint256 quoteUsdAtLaunchE8)";

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const feeLogs = await getLogs({
    target: PAIR_V4_LOCKER,
    eventAbi: FEES_ALLOCATED_ABI,
  });

  for (const log of feeLogs) {
    const asset = String(log.asset);
    const creatorFee = BigInt(log.creatorFee);
    const protocolFee = BigInt(log.protocolFee);
    dailyFees.add(asset, creatorFee + protocolFee, METRIC.SWAP_FEES);
    dailyRevenue.add(asset, protocolFee, "Protocol Swap Revenue");
    dailySupplySideRevenue.add(asset, creatorFee, METRIC.CREATOR_FEES);
  }

  const launchLogs = await getLogs({
    target: LAUNCHPAD,
    eventAbi: PAIR_POOL_CREATED_ABI,
  });

  const totalLaunchFee = LAUNCH_FEE_WEI * BigInt(launchLogs.length);
  dailyFees.addGasToken(totalLaunchFee, "Token Launch Fees");
  dailyRevenue.addGasToken(totalLaunchFee, "Token Launch Fees");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "1% pool swap fee on every trade, accruing to permanently locked Uniswap V4 positions and periodically swept to creators and the protocol, plus a 0.0005 ETH launch fee paid at each token deployment.",
  Revenue:
    "30% of collected swap fees credited to the treasury claimable balance, plus the full 0.0005 ETH launch fee paid to the protocol treasury at launch.",
  ProtocolRevenue:
    "30% of collected swap fees credited to the treasury claimable balance, plus the full 0.0005 ETH launch fee paid to the protocol treasury at launch.",
  SupplySideRevenue:
    "70% of collected swap fees credited to the creator claimable balance when fees are collected and allocated.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "1% fee on every swap, accruing to the locked V4 position and periodically swept to creators and the protocol.",
    "Token Launch Fees":
      "0.0005 ETH launch fee paid at token deployment, forwarded to the protocol treasury once per token launched.",
  },
  Revenue: {
    "Protocol Swap Revenue":
      "30% of collected swap fees credited to the treasury claimable balance when fees are collected and allocated.",
    "Token Launch Fees":
      "Full 0.0005 ETH launch fee paid to the protocol treasury at launch.",
  },
  ProtocolRevenue: {
    "Protocol Swap Revenue":
      "30% of collected swap fees credited to the treasury claimable balance when fees are collected and allocated.",
    "Token Launch Fees":
      "Full 0.0005 ETH launch fee paid to the protocol treasury at launch.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]:
      "70% of collected swap fees credited to the creator claimable balance when fees are collected and allocated.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-26",
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
