import {
    Dependencies,
    FetchOptions,
    SimpleAdapter,
  } from "../../adapters/types";
  import { CHAIN } from "../../helpers/chains";
  import { oreHelperCountSolBalanceDiff } from "../ore";
  
  const fetch: any = async (options: FetchOptions) => {
    const dailyFees = await oreHelperCountSolBalanceDiff(options, 'Az6VVPggdbxjrt4sL7FzjBunWD7piMZCUKvx316yLLmw')
    // dailyFees is the SOL actually received by the protocol wallet, i.e. the 10%
    // board fee. The methodology splits that fee as 1% admin + 7% buyback + 1%
    // motherlode + 1% LP of total SOL deployed (summing to the 10% fee), so as a
    // fraction of fees the protocol (admin) share is 1%/10% = 0.1 and the holders
    // share (1.05% stakers + 1% motherlode + 1% LP = 3.05% of deployed) is 0.305.
    const dailyProtocolRevenue = dailyFees.clone(0.1);
    const dailyHoldersRevenue = dailyFees.clone(0.305);

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
  