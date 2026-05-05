import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { oreHelperCountSolBalanceDiff } from "../ore";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await oreHelperCountSolBalanceDiff(
    options,
    "F4Uwd5sQT8go5r6iiejrVc2iurYSc2dA4RKvX3cLB8e3"
  );

  const dailyRevenue = dailyFees.clone(0.01);
  const dailyProtocolRevenue = dailyFees.clone(0.01);
  const dailySupplySideRevenue = dailyFees.clone(0.99);
  const dailyHoldersRevenue = dailyFees.clone(0.99);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
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
    Fees: "Counts SOL inbound to Jade's Treasury PDA F4Uwd5sQT8go5r6iiejrVc2iurYSc2dA4RKvX3cLB8e3, populated each round-reset with the SOL miners deployed on the Jade board.",
    Revenue: "1% of collected SOL fees, allocated to the protocol fee collector.",
    ProtocolRevenue: "1% of fees is allocated to the protocol fee collector.",
    SupplySideRevenue: "99% of fees funds JADE buyback-and-burn, distributed to JADE stakers.",
    HoldersRevenue: "99% of fees funds JADE buyback-and-burn, distributed to JADE stakers.",
  },
};

export default adapter;
