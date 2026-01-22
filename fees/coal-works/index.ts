import {
    Dependencies,
    FetchOptions,
    SimpleAdapter,
  } from "../../adapters/types";
  import { CHAIN } from "../../helpers/chains";
  import { oreHelperCountSolBalanceDiff } from "../ore";
  
  const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = await oreHelperCountSolBalanceDiff(options, 'Az6VVPggdbxjrt4sL7FzjBunWD7piMZCUKvx316yLLmw')
    const dailyProtocolRevenue = dailyFees.clone(0.01);
    const dailyHoldersRevenue = dailyFees.clone(0.0305);

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
      Fees: "Calculate the SOL fees gathered from 10% of the total SOL allocated to COAL boards and sent to the protocol wallet Az6VVPggdbxjrt4sL7FzjBunWD7piMZCUKvx316yLLmw.",
      Revenue: "All collected SOL fees count as revenue (10% protocol fee distribution).",
      ProtocolRevenue: "1% Admin Fee allocated to protocol maintenance and treasury.",
      HoldersRevenue: "3.05% distributed to holders: 1.05% to COAL stakers (15% of 7% buyback), 1% Solana Motherlode (jackpot pool), and 1% Liquidity Pool. The remaining 5.95% of the 7% buyback is burned.",
    },
  };
  
  export default adapter;
  