import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const pool = "0x7f5f7411c2c7eC60e2db946aBbe7DC354254870B";
const swapEventAbi = "event LOG_SWAP( address indexed caller, address indexed tokenIn, address indexed tokenOut, uint256 tokenAmountIn, uint256 tokenAmountOut, uint256 spread, uint256 taxBaseIn, uint256 priceIn, uint256 priceOut)";
const getSwapFeeAbi = "function getSwapFee() external view returns (uint256)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const swapFee = await options.api.call({
    target: pool,
    abi: getSwapFeeAbi,
  })

  const swapLogs = await options.getLogs({
    target: pool,
    eventAbi: swapEventAbi,
  })

  for (const log of swapLogs) {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: log.tokenIn, token1: log.tokenOut, amount0: log.tokenAmountIn, amount1: log.tokenAmountOut })

    const feeAmount = (BigInt(log.tokenAmountIn) * BigInt(swapFee)) / BigInt(1e18);
    dailyFees.add(log.tokenIn, feeAmount);
  }

  return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch,
      start: "2022-06-13"
    },
  },
  methodology: {
    "Volume": "Trading volume on the swaap maker v1 pool.",
    "Fees": "All fees charged on the swaap maker v1 pool.",
    "Revenue": "No exit fees charged by the v1 pool.",
    "SupplySideRevenue": "All swap fees are distributed to liquidity providers.",
  }
}

export default adapter;