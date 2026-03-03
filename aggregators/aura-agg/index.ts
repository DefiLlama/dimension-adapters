import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TransformedERC20Event =
  "event TransformedERC20(address indexed taker, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const AURA_AGGREGATOR_CONTRACT = "0xEc46A87ba4d423BaF59aeD8e16AE3E91800581Ef"

const FLAT_FEE_RATE = 0.0005 // 0.05%

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs: any[] = await options.getLogs({
    target: AURA_AGGREGATOR_CONTRACT,
    eventAbi: TransformedERC20Event,
  });

  for (const log of logs) {
    let token = log.inputToken;
    if (log.inputToken === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
      // price for native token not supported - WXPL
      token = "0x6100E367285b01F48D07953803A2d8dCA5D19873";
    }
    dailyVolume.add(token, log.inputTokenAmount);
    dailyFees.add(token, Number(log.inputTokenAmount) * FLAT_FEE_RATE);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
   };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2025-10-14",
  methodology: {
    Volume: "Total trading volume aggregated via Aura routers.",
    Fees: "Flat 0.05% amount of trading fees on all trades.",
    Revenue: "Flat 0.05% amount of trading fees on all trades are revenue.",
    ProtocolRevenue: "Flat 0.05% amount of trading fees on all trades are revenue.",
  },
  chains: [CHAIN.PLASMA],
};

export default adapter;
