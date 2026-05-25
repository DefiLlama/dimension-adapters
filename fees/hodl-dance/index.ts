import { FetchOptions } from "../helper/adapter";
import { getLogs } from "../helper/utils";

const FACTORY = "0x99A1F02f56E8356e6E90A880DBb1be6EC7485737";
const START_BLOCK = 83360171;
const FEE_MULTISIG = "0x41E046D798B0f0D705Dd4BAf1FC9Aa5fdf8822f1";

async function fetch(options: FetchOptions) {
  // Fetch all BondingCurve contracts created by the factory (for future extensions)
  const logs = await getLogs({
    api: options.api,
    target: FACTORY,
    fromBlock: START_BLOCK,
    toBlock: options.toBlock,
    event: "event TokenLaunched(address indexed tokenAddress, address indexed bondingCurveAddress, address indexed creator)",
  });

  const bondingCurves = logs.map((log: any) => log.args.bondingCurveAddress);

  // For now we calculate revenue as all BNB received by the multisig
  // (this is the most accurate way to track the 1% platform fee)
  const dailyRevenue = await options.api.sumTokens({
    owners: [FEE_MULTISIG],
    tokens: ["0x0000000000000000000000000000000000000000"], // BNB
    fromBlock: options.fromBlock,
    toBlock: options.toBlock,
  });

  return {
    timestamp: options.toTimestamp,
    dailyFees: dailyRevenue,      // for now fees = revenue (platform takes 100% of the 1%)
    dailyRevenue: dailyRevenue,
  };
}

const adapter: any = {
  version: 2,
  bsc: {
    fetch,
    start: START_BLOCK,
  },
  methodology: "1% platform fee from every buy/sell transaction in BondingCurve contracts. All fees go directly to the platform multisig (0x41E046D798B0f0D705Dd4BAf1FC9Aa5fdf8822f1).",
};

export default adapter;
