
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SwapEvent = "event Swap(address tokenIn, address tokenOut, uint256 amountIn, address referer, address sender)";

const factory_contract = "0x4f4b84b42059E8CaabB211Aa8F02A9cab53A6c4e";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const data: any[] = await options.getLogs({
    target: factory_contract,
    eventAbi: SwapEvent,
  });
  data.forEach((log: any) => {
    dailyVolume.add(log.tokenIn, log.amountIn);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-07-05",
      meta: {
        methodology: {
          Volume: "Apstation volume",
        },
      },
    },
  },
};

export default adapter;
