import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Vailox is a P2P crypto <-> fiat marketplace. The seller locks stablecoins in the VailoxEscrow contract; when the
// buyer's fiat payment is confirmed the escrow is released (EscrowComplete), the buyer receives value - receiverFee
// and both the senderFee and the receiverFee are credited to feesAvailable, withdrawable only by the owner.
// Cancelled or refunded escrows return value + senderFee to the seller and charge no fee.
// Verified source: https://sourcify.dev/server/v2/contract/137/0x8Da513d9B614D0a473eAf294E3e531Cd4EEa9984?fields=sources
// Same CREATE2 address on every EVM chain (see deployment txs on each explorer).
// Tron escrow (TKTF8R8bak9oN1tDch6CFVyMWSakfRRZLK) is deployed but has no trades yet, so it is not listed here.
const ESCROW = "0x8Da513d9B614D0a473eAf294E3e531Cd4EEa9984";

const ESCROW_COMPLETE_EVENT =
  "event EscrowComplete(uint256 indexed orderId, (address sender, address receiver, uint256 value, uint256 receiverFee, uint256 senderFee, address currency, uint8 status, uint64 created, bool isSenderMerchant, bool isReceiverMerchant, uint64 escrowTimeProcess) escrow)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  // All fees accrue to the protocol owner, nothing is shared with LPs, referrers or token holders.
  const dailyRevenue = options.createBalances();
  const logs = await options.getLogs({ target: ESCROW, eventAbi: ESCROW_COMPLETE_EVENT });
  for (const { escrow } of logs) {
    dailyFees.add(escrow.currency, escrow.senderFee, "Seller Escrow Fees");
    dailyFees.add(escrow.currency, escrow.receiverFee, "Buyer Escrow Fees");
    dailyRevenue.add(escrow.currency, escrow.senderFee, "Seller Escrow Fees To Protocol");
    dailyRevenue.add(escrow.currency, escrow.receiverFee, "Buyer Escrow Fees To Protocol");
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const methodology = {
  Fees: "Escrow fees paid by sellers and buyers on completed P2P trades, read from EscrowComplete events. Fees are tiered by trade size (fixed fee below 50 USD, then 1.25% down to 0.25%) with a lower rate for verified merchants. Cancelled or refunded trades pay no fee.",
  UserFees: "All escrow fees are paid directly by the trading users.",
  Revenue: "All escrow fees are kept by the protocol.",
  ProtocolRevenue: "All escrow fees go to the protocol treasury.",
};

const breakdownMethodology = {
  Fees: {
    "Seller Escrow Fees": "Fee paid by the seller on top of the escrowed amount, charged when the trade completes.",
    "Buyer Escrow Fees": "Fee deducted from the amount the buyer receives when the trade completes.",
  },
  UserFees: {
    "Seller Escrow Fees": "Fee paid by the seller on top of the escrowed amount, charged when the trade completes.",
    "Buyer Escrow Fees": "Fee deducted from the amount the buyer receives when the trade completes.",
  },
  Revenue: {
    "Seller Escrow Fees To Protocol": "Seller escrow fees credited to the protocol on completion.",
    "Buyer Escrow Fees To Protocol": "Buyer escrow fees credited to the protocol on completion.",
  },
  ProtocolRevenue: {
    "Seller Escrow Fees To Protocol": "Seller escrow fees credited to the protocol on completion.",
    "Buyer Escrow Fees To Protocol": "Buyer escrow fees credited to the protocol on completion.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.POLYGON, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.BSC],
  start: "2025-12-20",
  methodology,
  breakdownMethodology,
};

export default adapter;
