import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { oreHelperCountSolBalanceDiff } from "../ore";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await oreHelperCountSolBalanceDiff(options, '5epGzdW6veQwLQiQs1L45uUQ8jdSLQHWL8RbC7uTWVY3')

  const dailyProtocolRevenue = dailyFees.clone(0.01);
  const dailyHoldersRevenue = dailyFees.clone(0.99);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-18",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Calculate the GODL tokens gathered from 10% of the total SOL allocated to GODL boards and sent to the protocol wallet 5epGzdW6veQwLQiQs1L45uUQ8jdSLQHWL8RbC7uTWVY3.",
    Revenue: "All collected GODL fees count as revenue.",
    ProtocolRevenue: "1% of all GODL revenue is allocated to the protocol treasury.",
    HoldersRevenue: "The remaining 99% of GODL fees are used for GODL buybacks and burns, with value distributed to GODL stakers.",
  },
};

export default adapter;
