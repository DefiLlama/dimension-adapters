import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TransformedERC20Event = "event TransformedERC20 (address taker, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const BYTZZ_ADDRESS = "0x80197522c069a86dd8bb437e58c91cfbc05f378b"

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs: any[] = await options.getLogs({
    target: BYTZZ_ADDRESS,
    eventAbi: TransformedERC20Event,
  });

  logs.forEach((log: any) => {
    dailyVolume.add(log.inputToken, log.inputTokenAmount);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2025-08-26",
  methodology: {
    Volume: "Volume from Bytzz",
  },
  chains: [CHAIN.XLAYER],
};

export default adapter;