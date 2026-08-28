import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Prism Network rents GPUs by the second. A renter funds an escrow up front and
// the escrow finalises the lease onchain, splitting what was actually consumed
// between the protocol and the operator whose machine served it. Unused deposit
// is refunded in the same transaction and is not a fee.
const ESCROW = "0x62C042265991bEa17B07229322A01850974626dA";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

// `charged` is what the renter paid for the time consumed, and it is exactly
// `fee + providerPaid`, so the three metrics come from one event with no
// double counting and no price lookup of our own.
const LEASE_FINALIZED =
  "event LeaseFinalized(uint256 indexed leaseId, uint256 charged, uint256 fee, uint256 providerPaid, uint256 refunded, bytes32 receiptHash)";

const GPU_LEASE_RENT = "GPU Lease Rent";
const GPU_LEASE_RENT_TO_PROTOCOL = "GPU Lease Rent To Protocol";
const GPU_LEASE_RENT_TO_PROVIDERS = "GPU Lease Rent To Providers";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({ target: ESCROW, eventAbi: LEASE_FINALIZED });
  for (const log of logs) {
    dailyFees.add(USDG, log.charged, GPU_LEASE_RENT);
    dailyRevenue.add(USDG, log.fee, GPU_LEASE_RENT_TO_PROTOCOL);
    dailySupplySideRevenue.add(USDG, log.providerPaid, GPU_LEASE_RENT_TO_PROVIDERS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "USDG charged to renters when a GPU lease is finalised onchain. Deposits are taken up front but only the time actually consumed is charged; the unused remainder is refunded in the same transaction and is not counted.",
  Revenue: "The protocol's share of each finalised lease, currently 10% of the amount charged.",
  ProtocolRevenue: "Same as revenue (10% of GPU lease amount). The protocol's share accrues to the Prism treasury and none of it is distributed to token holders.",
  SupplySideRevenue: "The remainder of each finalised lease, paid to the operator whose GPU served it.",
};

const breakdownMethodology = {
  Fees: {
    [GPU_LEASE_RENT]: "USDG charged for GPU time actually consumed when a lease is finalised. Unused deposit is refunded in the same transaction and is not counted.",
  },
  Revenue: {
    [GPU_LEASE_RENT_TO_PROTOCOL]: "Protocol share of each finalised GPU lease, currently 10% of the amount charged.",
  },
  ProtocolRevenue: {
    [GPU_LEASE_RENT_TO_PROTOCOL]: "Protocol share of each finalised GPU lease, currently 10% of the amount charged, accruing to the Prism treasury.",
  },
  SupplySideRevenue: {
    [GPU_LEASE_RENT_TO_PROVIDERS]: "Remainder of each finalised GPU lease, paid to the operator whose GPU served it.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-13",
  fetch,
};

export default adapter;
