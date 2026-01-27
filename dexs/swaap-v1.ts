import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const pool = "0x7f5f7411c2c7eC60e2db946aBbe7DC354254870B";
const swapEventAbi = "event LOG_SWAP( address indexed caller, address indexed tokenIn, address indexed tokenOut, uint256 tokenAmountIn, uint256 tokenAmountOut, uint256 spread, uint256 taxBaseIn, uint256 priceIn, uint256 priceOut)";
const getSwapFeeAbi = "function getSwapFee() external view returns (uint256)";

// Decimals used by the price oracle
const PRICE_DECIMALS = 8;

const TOKEN_DECIMALS: { [key: string]: number } = {
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": 6,  // USDC.e
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": 18, // WETH
  "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6": 8,  // WBTC
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const swapFee = await options.api.call({ target: pool, abi: getSwapFeeAbi });
  const swapLogs = await options.getLogs({
    target: pool,
    eventAbi: swapEventAbi,
  })

  for (const log of swapLogs) {
    const tokenIn = log.tokenIn.toLowerCase();

    // Calculate USD volume using the oracle price
    const volumeUSD = Number(log.tokenAmountIn) * Number(log.priceIn) / (10 ** TOKEN_DECIMALS[tokenIn]) / (10 ** PRICE_DECIMALS);
    dailyVolume.addUSDValue(volumeUSD);

    const feeAmountToken = (BigInt(log.tokenAmountIn) * BigInt(swapFee)) / BigInt(1e18);
    const feeUSD = Number(feeAmountToken) * Number(log.priceIn) / (10 ** TOKEN_DECIMALS[tokenIn]) / (10 ** PRICE_DECIMALS);
    dailyFees.addUSDValue(feeUSD);
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