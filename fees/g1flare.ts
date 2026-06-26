import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const MODULE1 = "0x9f17a5d7cd90181a34a2011e900b440d71e2c011";
const USDT0 = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  const logs = await options.getLogs({
    target: MODULE1,
    eventAbi: "event DepositReceived(address indexed sender, uint256 amount, uint256 feeAmount, uint256 netAmount, uint256 newContractBalance)",
  });
  
  for (const log of logs) {
    dailyFees.add(USDT0, BigInt(log.feeAmount));
  }
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "0.05 percent fee on every deposit.",
    Revenue: "Same as fees - no supply-side split.",
    ProtocolRevenue: "Same as fees - no supply-side split.",
  },
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
      start: '2026-06-12',
    },
  },
};

export default adapter;
