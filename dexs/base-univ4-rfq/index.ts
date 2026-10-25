import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Live UniswapV4RFQHook contract on Base Mainnet (8453)
// Verified source: https://basescan.org/address/0xd72CD1d46bA05479583fbB561B558f133BA98088#code
const HOOK_ADDRESS = "0xd72CD1d46bA05479583fbB561B558f133BA98088";

// Event emitted on each atomic RFQ swap execution on Base Mainnet
const RFQ_SWAP_EVENT_ABI =
  "event RFQSwapExecuted(bytes32 indexed quoteId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 finalPromisedUserOut, uint256 kyberActualOut, uint256 netProfit)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Query completed RFQ swap events directly from the Hook contract on Base
  const logs = await options.getLogs({
    target: HOOK_ADDRESS,
    eventAbi: RFQ_SWAP_EVENT_ABI,
  });

  for (const log of logs) {
    const tokenIn = log.tokenIn;
    const tokenOut = log.tokenOut;
    const amountIn = BigInt(log.amountIn);
    const netProfit = BigInt(log.netProfit);

    // Swap volume: input leg of the completed swap
    dailyVolume.add(tokenIn, amountIn);

    // 30 bps swap fee charged to user relative to oracle quote
    dailyFees.add(tokenIn, (amountIn * 30n) / 10000n);

    // Realized filler arbitrage profit sent to treasury in tokenOut
    if (netProfit > 0n) {
      dailyRevenue.add(tokenOut, netProfit);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "Input amount of atomic RFQ swaps executed through the Uniswap v4 Hook on Base Mainnet.",
  Fees: "Fixed 30 bps swap fee applied to user input relative to Chainlink oracle rates.",
  UserFees: "Swap fees paid by users (30 bps).",
  Revenue: "Realized filler arbitrage profit (netProfit) in tokenOut transferred directly to the protocol treasury.",
  ProtocolRevenue: "Net filler profit retained by the protocol treasury.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  start: "2026-10-18",
  methodology,
};

export default adapter;
