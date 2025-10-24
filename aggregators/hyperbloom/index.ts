import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TransformedERC20Event =
  "event TransformedERC20(address indexed taker, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)";

const HYPERBLOOM_ADDRESSES = [
  "0x4212a77e4533eca49643d7b731f5fb1b2782fe94", //new
  "0x74cddb25b3f230200b28d79ce85c43991648954a", //old
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs: any[] = await options.getLogs({
    targets: HYPERBLOOM_ADDRESSES,
    eventAbi: TransformedERC20Event,
  });

  logs.forEach((log: any) => {
    dailyVolume.add(log.outputToken, log.outputTokenAmount);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2025-05-31",
  methodology: {
    Volume: "Volume from Hyperbloom",
  },
  chains: [CHAIN.HYPERLIQUID],
};

export default adapter;