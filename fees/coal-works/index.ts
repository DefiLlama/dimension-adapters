import {
    Dependencies,
    FetchOptions,
    SimpleAdapter,
  } from "../../adapters/types";
  import { CHAIN } from "../../helpers/chains";
  import { oreHelperCountSolBalanceDiff } from "../ore";
  
  const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = await oreHelperCountSolBalanceDiff(options, 'Az6VVPggdbxjrt4sL7FzjBunWD7piMZCUKvx316yLLmw')
    console.log(dailyFees);
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
    start: "2026-01-12",
    dependencies: [Dependencies.DUNE],
    methodology: {
      Fees: "Calculate the COAL tokens gathered from 10% of the total SOL allocated to COAL boards and sent to the protocol wallet Az6VVPggdbxjrt4sL7FzjBunWD7piMZCUKvx316yLLmw.",
      Revenue: "All collected COAL fees count as revenue.",
      ProtocolRevenue: "1% of all COAL revenue is allocated to the protocol treasury.",
      HoldersRevenue: "The remaining 99% of COAL fees are used for COAL buybacks and burns, with value distributed to COAL stakers.",
    },
  };
  
  export default adapter;
  