import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  // Even though gas is consumed on-chain, sFUEL is free and has no value
  // Users obtain sFUEL from faucets at no cost
  // All fee metrics are 0 in USD terms since sFUEL = $0
  // Network revenue comes from SKL token staking subscriptions, not transaction fees
  
  return {
    dailyFees,
    dailyRevenue,
    dailyUserFees,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue,
    timestamp: options.startTimestamp,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SKALE_EUROPA]: {
      fetch,
      start: '2024-04-01',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "SKALE uses sFUEL (SKALE Fuel), a gas token distributed FREE via faucets. While transactions consume gas on-chain, sFUEL has $0 monetary value. User fees are $0.",
    UserFees: "Users pay $0 for transactions. sFUEL (gas token) is obtained free from faucets and has no market value.",
    Revenue: "Network revenue comes from SKL token staking subscriptions by dApp developers, not from transaction fees. On-chain transaction fees are $0 as sFUEL is free.",
    ProtocolRevenue: "Protocol revenue is generated through SKL staking model where dApp developers stake tokens for network access. Transaction fees contribute $0 as sFUEL is valueless.",
    SupplySideRevenue: "Validators/nodes are compensated through SKL staking rewards, not transaction fees. On-chain gas fees in sFUEL are $0.",
    HoldersRevenue: "No sFUEL is burned or distributed as revenue since it has no value. Revenue model is entirely based on SKL token staking."
  }
};

export default adapter;