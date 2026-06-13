import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const MODULE1 = "0x9f17a5d7cd90181a34a2011e900b440d71e2c011";
const USDT0 = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  
  const logs = await options.getLogs({
    target: MODULE1,
    eventAbi: "event DepositReceived(address indexed sender, uint256 amount, uint256 feeAmount, uint256 netAmount, uint256 newContractBalance)",
  });
  
  for (const log of logs) {
    dailyVolume.add(USDT0, BigInt(log.amount));
    dailyFees.add(USDT0, BigInt(log.feeAmount));
  }
  
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees.clone(),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
      start: 1781267849,
      meta: {
        methodology: {
          Volume: "Total USDT0 deposited through G1Flare Module 1.",
          Fees: "0.05 percent fee on every deposit.",
          Revenue: "Same as fees — no supply-side split.",
        },
      },
    },
  },
};

export default adapter;
