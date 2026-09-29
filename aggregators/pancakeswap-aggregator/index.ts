import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// PancakeSwap Aggregator (PCS Hub) routers; old routers are kept for history
const ROUTERS: Record<string, { current: string[]; legacy: string[] }> = {
  [CHAIN.BSC]: {
    current: ["0x2f68417A18dA681589F4eA64B9Cc9839209acfF7", "0x036deD3e51163782eF2903930C4AbC93F34f258C"],
    legacy: ["0x40A1Fe393A7F566F27dF6acE18e6773be844dAfc"],
  },
  [CHAIN.ETHEREUM]: {
    current: ["0x2f68417A18dA681589F4eA64B9Cc9839209acfF7", "0x036deD3e51163782eF2903930C4AbC93F34f258C"],
    legacy: ["0x40A1Fe393A7F566F27dF6acE18e6773be844dAfc"],
  },
  [CHAIN.BASE]: {
    current: ["0x2f68417A18dA681589F4eA64B9Cc9839209acfF7", "0x036deD3e51163782eF2903930C4AbC93F34f258C"],
    legacy: ["0x40A1Fe393A7F566F27dF6acE18e6773be844dAfc"],
  },
  [CHAIN.ROBINHOOD]: {
    current: ["0x6AF306Cd8Be7CEfd38edf4cB7D6FE83A6E29661B"],
    legacy: ["0xfAc89a4347d6c13825F0f8A30C578c106e967445"],
  },
};

const ORDER_RECORD_EVENT = "event OrderRecord(uint256 indexed orderId, address inputToken, address outputToken, address sender, uint256 inputAmount, uint256 outputAmount, address recipient)";
const LEGACY_ORDER_RECORD_EVENT = "event OrderRecord(address inputToken, address outputToken, address sender, uint256 inputAmount, uint256 outputAmount, address recipient)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { current, legacy } = ROUTERS[options.chain];

  const logs = [
    ...(await options.getLogs({ targets: current, eventAbi: ORDER_RECORD_EVENT })),
    ...(await options.getLogs({ targets: legacy, eventAbi: LEGACY_ORDER_RECORD_EVENT })),
  ];

  logs.forEach((log: any) => {
    if (log.inputToken.toLowerCase() === ADDRESSES.null) dailyVolume.addGasToken(log.inputAmount);
    else dailyVolume.add(log.inputToken, log.inputAmount);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: "2026-04-13" },
    [CHAIN.ETHEREUM]: { start: "2026-04-13" },
    [CHAIN.BASE]: { start: "2026-04-13" },
    [CHAIN.ROBINHOOD]: { start: "2026-07-17" },
  },
  methodology: {
    Volume: "Input amount of every swap settled through the PancakeSwap Aggregator router, read from its OrderRecord events.",
  },
};

export default adapter;
