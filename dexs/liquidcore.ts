import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SwapEvent = "event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 reserve0, uint256 reserve1)";

const LIQUIDCORE_ROUTER = "0x625aC1D165c776121A52ff158e76e3544B4a0b8B";

const PROTOCOL_FEE_RATIO = 0.1;

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const pools = await options.api.call({
    target: LIQUIDCORE_ROUTER,
    abi: "function getPools() external view returns (address[])",
  });

  const logs = await options.getLogs({
    targets: pools,
    eventAbi: SwapEvent,
    flatten: true,
  });

  const bps = BigInt(Math.floor(PROTOCOL_FEE_RATIO * 10000));

  for (const log of logs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
    dailyFees.add(log.tokenOut, log.fee);

    const protocolFee = (BigInt(log.fee) * bps) / BigInt(10000);
    const lpFee = BigInt(log.fee) - protocolFee;

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
  Volume: "Volume is calculated from the amountIn of all Swap events on LiquidCore pools.",
  Fees: "All swap fees collected by LiquidCore pools, split between LPs and protocol.",
  UserFees: "Fees paid by users on each swap.",
  Revenue: "Protocol share of swap fees.",
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
