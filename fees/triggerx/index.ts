import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GAS_REGISTRY = "0xe2AC670F7D66c69D547A44D08F9bA1Fc0Fc0f991";
const ETHBalanceDeductedEvent = 'event ETHBalanceDeducted(address indexed user, uint256 amount)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    target: GAS_REGISTRY,
    eventAbi: ETHBalanceDeductedEvent,
  });
  for (const log of logs) {
    dailyFees.addGasToken(log.amount);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-12-03',
    }
  },
  methodology: {
    Fees: "Total ETH fees deducted from deposits by the protocol.",
    Revenue: "Total ETH fees deducted from deposits by the protocol are collected by protocol as revenue.",
    ProtocolRevenue: "Total ETH fees deducted from deposits by the protocol are collected by protocol as revenue.",
  },
};

export default adapter;