import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SwapEvent = "event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 reserve0, uint256 reserve1)";

const LIQUIDCORE_POOLS = [
  "0xA7478A5ff7cB27A8008D6D90785db10223bc6087",
  "0xD3994A6CF46cA91536376f89aCDadf92eD289a9F"
];

// Protocol takes 10% of fees, LPs get 90%
const PROTOCOL_FEE_RATIO = 0.1;

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = (await Promise.all(
    LIQUIDCORE_POOLS.map(pool => 
      options.getLogs({
        target: pool,
        eventAbi: SwapEvent,
      })
    )
  )).flat();

  for (const log of logs) {
    // Track volume using the input token amount
    dailyVolume.add(log.tokenIn, log.amountIn);
    
    // Track total fees (fees are in the output token)
    dailyFees.add(log.tokenOut, log.fee);
  
    // Calculate protocol and LP fee splits
    const protocolFee = BigInt(log.fee) * BigInt(Math.floor(PROTOCOL_FEE_RATIO * 10000)) / BigInt(10000);
    const lpFee = BigInt(log.fee) - protocolFee;
    
    // Track revenue splits
    dailyRevenue.add(log.tokenOut, protocolFee);
    dailyProtocolRevenue.add(log.tokenOut, protocolFee);
    dailySupplySideRevenue.add(log.tokenOut, lpFee);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Volume is calculated from the amountIn of all Swap events on the LiquidCore pool.",
  Fees: "All swap fees collected by the LiquidCore pool, which are split between LPs and protocol.",
  UserFees: "Fees paid by users on each swap, calculated dynamically.",
  Revenue: "Total revenue from all swap fees, which is split between protocol and liquidity providers.",
  ProtocolRevenue: `${PROTOCOL_FEE_RATIO * 100}% of swap fees go to the protocol.`,
  SupplySideRevenue: `${(1 - PROTOCOL_FEE_RATIO) * 100}% of swap fees are distributed to liquidity providers.`,
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-08-11",
    },
  },
};

export default adapter;

