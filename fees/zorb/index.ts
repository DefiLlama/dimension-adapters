import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { oreHelperCountSolBalanceDiff } from "../ore";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await oreHelperCountSolBalanceDiff(options, '6aAGoVq9jKywWXyvWwoUtZFxbjR5aLBtfjhQXP1xezA')

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
  start: "2025-11-16",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Calculate the zorb.supply tokens gathered from 10% of the total SOL allocated to zorb.supply boards and sent to the protocol wallet 6aAGoVq9jKywWXyvWwoUtZFxbjR5aLBtfjhQXP1xezA.",
    Revenue: "All collected zorb.supply fees count as revenue.",
    ProtocolRevenue: "1% of all zorb.supply revenue is allocated to the protocol treasury.",
    HoldersRevenue: "The remaining 99% of zorb.supply fees are used for zorb.supply buybacks and burns, with value distributed to zorb.supply stakers.",
  },
};

export default adapter;
