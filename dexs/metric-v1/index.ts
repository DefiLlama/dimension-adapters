import { CHAIN } from "../../helpers/chains";
import { getMetricAdapter, MetricChainConfig, MetricEvents } from "../metric/utils";

const factory = "0x622911384e7973439b8be305f5e3Fc3c5736EDe4";

const chainConfig: MetricChainConfig = {
  [CHAIN.ETHEREUM]: { fromBlock: 25524981, start: "2026-07-13" },
  [CHAIN.BASE]: { fromBlock: 48585753, start: "2026-07-13" },
  [CHAIN.ARBITRUM]: { fromBlock: 486842281, start: "2026-07-23" },
  [CHAIN.ROBINHOOD]: { fromBlock: 8800150, start: "2026-07-13" },
};

const events: MetricEvents = {
  swapEvent:
    "event Swap(address indexed sender, address indexed recipient, bool exactInput, int256 amount0Delta, int256 amount1Delta, int8 newTick, uint104 newPositionInBin, uint256 protocolFeeAmount)",
  poolCreatedEvent:
    "event PoolCreated(address indexed poolAddress, address indexed token0, address indexed token1, uint256 poolIdx, address factory, address admin, address priceProvider, address[] extensions, (uint256 beforeAddLiquidity,uint256 afterAddLiquidity,uint256 beforeRemoveLiquidity,uint256 afterRemoveLiquidity,uint256 beforeSwap,uint256 afterSwap) extensionOrders, uint256 priceProviderTimelock, uint256 initialAmount0PerShareE18, uint256 initialAmount1PerShareE18, uint256 minimalMintableLiquidity, uint24 spreadProtocolFeeE6, uint24 protocolNotionalFeeE8, uint24 adminSpreadFeeE6, uint24 adminNotionalFeeE8, address adminFeeDestination, int24 curBinDistFromProvidedPriceE6, uint256[] nonNegativeBinDataArray, uint256[] negativeBinDataArray)",
  poolField: "poolAddress",
};

const adapter = getMetricAdapter(factory, chainConfig, events);

export default adapter;
