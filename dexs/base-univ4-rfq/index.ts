import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Live UniswapV4RFQHook contract on Base Mainnet (8453)
const HOOK_ADDRESS = "0xd72CD1d46bA05479583fbB561B558f133BA98088";

// Event emitted on each atomic RFQ swap execution on Base Mainnet
const RFQ_SWAP_EVENT_ABI =
  "event RFQSwapExecuted(bytes32 indexed quoteId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 finalPromisedUserOut, uint256 kyberActualOut, uint256 netProfit)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Query completed RFQ swap events directly from the Hook contract on Base
  const logs = await options.getLogs({
    target: HOOK_ADDRESS,
    eventAbi: RFQ_SWAP_EVENT_ABI,
  });

  for (const log of logs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true,
  chains: [CHAIN.BASE],
  fetch,
  start: "2026-10-18",
  methodology: {
    Volume: "Input amount of atomic RFQ swaps executed through the Uniswap v4 Hook on Base Mainnet.",
  },
};

export default adapter;
