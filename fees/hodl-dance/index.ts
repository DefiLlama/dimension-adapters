import { FetchOptions } from "../helper/adapter";

const FACTORY = "0x99A1F02f56E8356e6E90A880DBb1be6EC7485737";
const START_BLOCK = 83360171;
const FEE_MULTISIG = "0x41E046D798B0f0D705Dd4BAf1FC9Aa5fdf8822f1";

async function fetch(options: FetchOptions) {
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
}

const adapter: any = {
  version: 2,
  bsc: {
    fetch,
    start: START_BLOCK,
    pullHourly: true,
  },
  breakdownMethodology: {
    Fees: "1% platform fee from every buy/sell transaction in BondingCurve contracts",
    Revenue: "All platform fees go directly to multisig 0x41E046D798B0f0D705Dd4BAf1FC9Aa5fdf8822f1",
  },
  methodology: "1% platform fee from every buy/sell transaction in BondingCurve contracts. All fees go directly to the platform multisig.",
};

export default adapter;
