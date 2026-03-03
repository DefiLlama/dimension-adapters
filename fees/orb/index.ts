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
    Fees: "Calculate the ore.blue tokens gathered from 10% of the total SOL allocated to ore.blue boards and sent to the protocol wallet 6aAGoVq9jKywWXyvWwoUtZFxbjR5aLBtfjhQXP1xezA.",
    Revenue: "All collected ore.blue fees count as revenue.",
    ProtocolRevenue: "1% of all ore.blue revenue is allocated to the protocol treasury.",
    HoldersRevenue: "The remaining 99% of ore.blue fees are used for ore.blue buybacks and burns, with value distributed to ore.blue stakers.",
  },
};

export default adapter;
