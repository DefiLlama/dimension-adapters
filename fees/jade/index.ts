import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { oreHelperCountSolBalanceDiff } from "../ore";

// Team multisig that receives the 1% admin fee on every round's total_deployed.
const FEE_COLLECTOR = "FW4UFt5nDKE2DLVNj979rXjFkjCdmzs9344JetX8hY9P";

// Treasury PDA that receives the vault portion of each round (~9% of winnings,
// or 100% of deployed in no-winner rounds). Treasury SOL is later spent on
// JADE buyback-and-burn: 90% of bought JADE is burned, 10% paid to JADE stakers.
const TREASURY_PDA = "F4Uwd5sQT8go5r6iiejrVc2iurYSc2dA4RKvX3cLB8e3";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyProtocolRevenue = await oreHelperCountSolBalanceDiff(options, FEE_COLLECTOR);
  const dailyHoldersRevenue = await oreHelperCountSolBalanceDiff(options, TREASURY_PDA);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyProtocolRevenue);
  dailyFees.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
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
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Sum of two SOL streams collected at every round reset on the Jade board: (1) a 1% admin fee on round.total_deployed forwarded to the Jade fee-collector multisig FW4UFt5nDKE2DLVNj979rXjFkjCdmzs9344JetX8hY9P, and (2) the vault portion (~9% of winnings, or 100% of deployed in no-winner rounds) forwarded to the Jade Treasury PDA F4Uwd5sQT8go5r6iiejrVc2iurYSc2dA4RKvX3cLB8e3.",
    Revenue: "All collected SOL is protocol revenue.",
    ProtocolRevenue: "1% admin fee on each round's total_deployed, accruing to the Jade fee-collector multisig.",
    HoldersRevenue: "Vault SOL flowing to the Jade Treasury PDA, later spent on JADE buyback-and-burn (90% burned, 10% paid to JADE stakers).",
  },
};

export default adapter;
