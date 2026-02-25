import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Zenland V2 - Decentralized Escrow Protocol
 * 
 * Fee Structure:
 * - Protocol creation fee: 1% (min $0.50, max $50) paid at escrow creation
 * - Fee is paid by buyer on top of escrow amount
 * - Fee is transferred directly to DAO treasury
 * 
 * Contracts (Ethereum Mainnet):
 * - EscrowFactory: 0xba2c6322fd59e2703a28d82db572950297600129
 * - FeeManager: 0x14f582bd5ddbc3e8416b9d3a9e5f0d3b6ce4206f
 * - AgentRegistry: 0x3406c744958b182d6edd2615ff9e53f0fbc60802
 * - Treasury: 0xa9790ac657bd38c8ef2568c1642b02d2b96f20dd
 */

// Contract addresses
const ESCROW_FACTORY = "0xba2c6322fd59e2703a28d82db572950297600129";

// Event ABI - matches EscrowEvents.sol exactly
const ProtocolFeePaidEvent = "event ProtocolFeePaid(address indexed payer, address indexed token, uint256 feeAmount)";

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  // Fetch ProtocolFeePaid events from the Factory
  const protocolFeeLogs = await getLogs({
    target: ESCROW_FACTORY,
    eventAbi: ProtocolFeePaidEvent,
  });

  // Process protocol fee events
  protocolFeeLogs.forEach((log: any) => {
    const token = log.token;
    const feeAmount = log.feeAmount;

    // Add to fees
    dailyFees.add(token, feeAmount, "Escrow creation fees");
    
    // All protocol fees go to treasury = protocol revenue
    dailyRevenue.add(token, feeAmount, "Escrow creation fees");
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Protocol creation fees paid by users when creating escrows. Fee is 1% of escrow amount with minimum $0.50 and maximum $50.",
  UserFees: "Users (buyers) pay creation fees at escrow creation time on top of the escrow amount.",
  Revenue: "All protocol creation fees are sent to the DAO treasury.",
  ProtocolRevenue: "Protocol creation fees collected by the DAO treasury.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2026-02-24",
    },
  },
  methodology,
  breakdownMethodology: {
    Fees: {
      "Escrow creation fees": "Fees paid by users when creating escrows"
    },
    Revenue: {
      "Escrow creation fees": "All the fees are sent to the DAO treasury"
    }
  }
};

export default adapter;
