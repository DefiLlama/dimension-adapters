import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BUYBACK_CONTRACT = "0x55836bD72800b23c64D384E8734330B8363e62Fa";

const SWAP_EXECUTED_EVENT = "event SwapExecuted(address indexed user, uint256 nativeAmount, uint256 nickelAmount, uint256 burnedAmount, uint256 treasuryAmount, uint256 timestamp)";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    target: BUYBACK_CONTRACT,
    eventAbi: SWAP_EXECUTED_EVENT,
  });

  let totalEthSpent = BigInt(0);

  for (const log of logs) {
    const nativeAmount = BigInt(log.nativeAmount || "0");
    totalEthSpent += nativeAmount;
  }

  dailyFees.addGasToken(totalEthSpent);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-12-15",
  methodology: {
    Fees: "10% of all mining fees collected from users",
    Revenue: "100% of the fees collected are used to buyback the nickel token.",
    ProtocolRevenue: "Protocol takes no direct fees",
    HoldersRevenue: "10% of the revenue shared with stakers and 90% of nickel token from revenue are burned.",
  },
};

export default adapter;
