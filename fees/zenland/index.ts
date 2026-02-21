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
 * - EscrowFactory: 0x11c6bb595824014e1c11c6b4a6ad2095cf7d22ab
 * - FeeManager: 0x9c364b9b5020bc63e074d43f7c68493c0bbdb0cd
 * - AgentRegistry: 0xb528f6ba2d75c383dfe6cdab9957a6cd6b45d90d
 * - Treasury: 0xcF3f26F73AEc469dfc5a0940b157214fD730B0FB
 */

// Contract addresses
const ESCROW_FACTORY = "0x11c6bb595824014e1c11c6b4a6ad2095cf7d22ab";

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
    dailyFees.add(token, feeAmount);
    
    // All protocol fees go to treasury = protocol revenue
    dailyRevenue.add(token, feeAmount);
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
      start: "2026-02-10",
    },
  },
  methodology,
};

export default adapter;
