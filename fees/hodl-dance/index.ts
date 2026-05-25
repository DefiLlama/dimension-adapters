import { FetchOptions } from "../helper/adapter";
import { getLogs } from "../helper/utils";

const FACTORY = "0x99A1F02f56E8356e6E90A880DBb1be6EC7485737";
const START_BLOCK = 83360171;
const FEE_MULTISIG = "0x41E046D798B0f0D705Dd4BAf1FC9Aa5fdf8822f1";

async function fetch(options: FetchOptions) {
  // Fetch all BondingCurve contracts created by the factory (same as TVL adapter)
  const logs = await getLogs({
    api: options.api,
    target: FACTORY,
    fromBlock: START_BLOCK,
    toBlock: options.toBlock,
    event: "event TokenLaunched(address indexed tokenAddress, address indexed bondingCurveAddress, address indexed creator)",
  });

  const bondingCurves = logs.map((log: any) => log.args.bondingCurveAddress);

  // TODO: In the future we can add Buy/Sell events from each BondingCurve to calculate exact 1% fees
  // For now we keep placeholder values - DefiLlama team usually helps finalize this after the PR

  return {
    timestamp: options.toTimestamp,
    dailyFees: "0",           // Total fees (1% from every buy/sell transaction)
    dailyRevenue: "0",        // Platform revenue (1% sent to multisig)
  };
}

const adapter: any = {
  version: 2,
  bsc: {
    fetch,
    start: START_BLOCK,
  },
  methodology: "Fees = 1% platform fee from every buy/sell transaction in all BondingCurve contracts. Revenue = fees sent to the platform multisig (0x41E046D798B0f0D705Dd4BAf1FC9Aa5fdf8822f1)",
};

export default adapter;
