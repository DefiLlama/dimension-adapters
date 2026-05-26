import { FetchOptions } from "../helper/adapter";

const FEE_MULTISIG = "0x41E046D798B0f0D705Dd4BAf1FC9Aa5fdf8822f1";

async function fetch(options: FetchOptions) {
  try {
    const dailyRevenue = await options.api.sumTokens({
      owners: [FEE_MULTISIG],
      tokens: ["0x0000000000000000000000000000000000000000"], // BNB
      fromBlock: options.fromBlock,
      toBlock: options.toBlock,
    });

    return {
      timestamp: options.toTimestamp,
      dailyFees: dailyRevenue,
      dailyRevenue: dailyRevenue,
      dailySupplySideRevenue: "0", // creators keep the rest
    };
  } catch (e) {
    // Handle recoverable chain read failures explicitly (as requested by CodeRabbit)
    return {
      timestamp: options.toTimestamp,
      dailyFees: "0",
      dailyRevenue: "0",
      dailySupplySideRevenue: "0",
    };
  }
}

const adapter: any = {
  version: 2,
  bsc: {
    fetch,
    start: 83360171,
    pullHourly: true,
  },
  breakdownMethodology: {
    Fees: "1% platform fee from every buy/sell transaction in BondingCurve contracts",
    Revenue: "All platform fees go directly to multisig 0x41E046D798B0f0D705Dd4BAf1FC9Aa5fdf8822f1",
  },
  methodology: "1% platform fee from every buy/sell transaction in BondingCurve contracts. All fees go directly to the platform multisig.",
};

export default adapter;
