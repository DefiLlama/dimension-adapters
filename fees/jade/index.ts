import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { oreHelperCountSolBalanceDiff } from "../ore";

// Team multisig that receives the 1% admin fee on every round's
// total_deployed (minus keeper gas reimbursement). This is the only
// stream retained by the protocol — it's the "Revenue" line.
const FEE_COLLECTOR = "FW4UFt5nDKE2DLVNj979rXjFkjCdmzs9344JetX8hY9P";

// Treasury PDA receives the vault portion of each round (10% of winnings,
// or ~99% of total_deployed in no-winner rounds). 90% of incoming vault
// funds JADE buyback (90% burned, 10% paid to JADE stakers); 10% feeds
// the deep-vein lottery (99% to stakers when it hits, 1% recycled). All
// of it accrues to JADE holders, not to the team.
const TREASURY_PDA = "F4Uwd5sQT8go5r6iiejrVc2iurYSc2dA4RKvX3cLB8e3";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyProtocolRevenue = await oreHelperCountSolBalanceDiff(options, FEE_COLLECTOR);
  const dailyHoldersRevenue = await oreHelperCountSolBalanceDiff(options, TREASURY_PDA);

  const dailyFees = dailyProtocolRevenue.clone();
  dailyFees.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-04-30",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "SOL collected at every round reset on the Jade board, summed across two streams: (1) the 1% admin fee on round.total_deployed (minus keeper gas reimbursement of ~50,000 lamports per reset) forwarded to the Jade fee-collector multisig FW4UFt5nDKE2DLVNj979rXjFkjCdmzs9344JetX8hY9P, and (2) the vault portion forwarded to the Jade Treasury PDA F4Uwd5sQT8go5r6iiejrVc2iurYSc2dA4RKvX3cLB8e3 — 10% of winnings in winner rounds, or ~99% of total_deployed in no-winner rounds.",
    Revenue: "Only the 1% admin-fee stream reaching the fee-collector multisig is protocol revenue. The vault stream flows to JADE holders via buyback-and-burn and is reported separately as HoldersRevenue.",
    ProtocolRevenue: "1% admin fee on each round's total_deployed (minus keeper gas reimbursement), accruing to the Jade fee-collector multisig.",
    HoldersRevenue: "Vault SOL inbound to the Jade Treasury PDA. Internally split 90/10: 90% funds the buyback-and-burn cycle (90% of bought JADE is burned, 10% is paid to JADE stakers), and 10% feeds the deep-vein lottery (99% of payouts go to stakers via stake_sol_factor, 1% recycles to the buyback pool).",
  },
};

export default adapter;
