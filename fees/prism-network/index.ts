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

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({ target: ESCROW, eventAbi: LEASE_FINALIZED });
  for (const log of logs) {
    dailyFees.add(USDG, log.charged);
    dailyRevenue.add(USDG, log.fee);
    dailySupplySideRevenue.add(USDG, log.providerPaid);
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
  ProtocolRevenue: "Same as revenue. The protocol's share accrues to the Prism treasury and none of it is distributed to token holders.",
  SupplySideRevenue: "The remainder of each finalised lease, paid to the operator whose GPU served it.",
};

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-08-13" },
  },
};

export default adapter;
