import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// CRSH's parimutuel market contracts on Monad. Older addresses are kept for
// historical coverage.
// Current: https://monadscan.com/address/0x8964d7c989bf4b9bbd179ecd205544d3bb5b10f8
// Legacy: https://monadscan.com/address/0x968279784d780c02a79b1c58ad69aaa832f09342
// Legacy: https://monadscan.com/address/0x7b9256fd345b6dfa78017094cae64b153de21fb2
const MARKET_CONTRACTS = [
  "0x8964d7C989bF4B9bbd179ecd205544d3bb5B10F8",
  "0x968279784d780c02a79b1c58ad69aaa832f09342",
  "0x7b9256fd345b6dFa78017094caE64B153dE21fb2",
];
// USDC (6 decimals): https://monadscan.com/token/0x754704bc059f8c67012fed69bc8a327a5aafb603
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

const PROTOCOL_FEE_RELEASED_EVENT =
  "event ProtocolFeeReleased(uint256 indexed marketId, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({
    targets: MARKET_CONTRACTS,
    eventAbi: PROTOCOL_FEE_RELEASED_EVENT,
  });

  for (const log of logs) dailyFees.add(USDC, log.amount, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees:
    "Realized CRSH fees from ProtocolFeeReleased events emitted by the current and legacy parimutuel market contracts. Canceled or waived markets emit no release event and are excluded.",
  Revenue:
    "All ProtocolFeeReleased USDC is retained by the CRSH protocol.",
  ProtocolRevenue:
    "All ProtocolFeeReleased USDC is retained by the CRSH protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "Protocol fee amounts released by CRSH market contracts after settlement.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]:
      "Protocol fee amounts retained by CRSH after settlement.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]:
      "Protocol fee amounts retained by CRSH after settlement.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2026-07-31",
  methodology,
  breakdownMethodology,
};

export default adapter;
