import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// PancakeSwap Aggregator (PCS Hub) routers, verified on-chain. 0x2f68... is a CREATE2 beacon proxy
// with the same address on BSC/Ethereum/Base (deployed 2026-08-25: BSC block 117927703, Ethereum
// 25829533, Base 50419490). Legacy router 0x40A1... was deployed 2026-04-13 (BSC 92262433, Ethereum
// 24869503, Base 44639213), which sets their start. 0x036d... was live only 2026-08-20/21.
// Robinhood's router is not at the CREATE2 address; its first router went live 2026-07-17.
const chainConfig: Record<string, { start: string; routers: string[]; legacyRouters: string[] }> = {
  [CHAIN.BSC]: {
    start: "2026-04-13",
    routers: ["0x2f68417A18dA681589F4eA64B9Cc9839209acfF7", "0x036deD3e51163782eF2903930C4AbC93F34f258C"],
    legacyRouters: ["0x40A1Fe393A7F566F27dF6acE18e6773be844dAfc"],
  },
  [CHAIN.ETHEREUM]: {
    start: "2026-04-13",
    routers: ["0x2f68417A18dA681589F4eA64B9Cc9839209acfF7", "0x036deD3e51163782eF2903930C4AbC93F34f258C"],
    legacyRouters: ["0x40A1Fe393A7F566F27dF6acE18e6773be844dAfc"],
  },
  [CHAIN.BASE]: {
    start: "2026-04-13",
    routers: ["0x2f68417A18dA681589F4eA64B9Cc9839209acfF7", "0x036deD3e51163782eF2903930C4AbC93F34f258C"],
    legacyRouters: ["0x40A1Fe393A7F566F27dF6acE18e6773be844dAfc"],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-17",
    routers: ["0x6AF306Cd8Be7CEfd38edf4cB7D6FE83A6E29661B"],
    legacyRouters: ["0xfAc89a4347d6c13825F0f8A30C578c106e967445"],
  },
};

const ORDER_RECORD_EVENT = "event OrderRecord(uint256 indexed orderId, address inputToken, address outputToken, address sender, uint256 inputAmount, uint256 outputAmount, address recipient)";
// Legacy routers emit the same event without the indexed orderId
const LEGACY_ORDER_RECORD_EVENT = "event OrderRecord(address inputToken, address outputToken, address sender, uint256 inputAmount, uint256 outputAmount, address recipient)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { routers, legacyRouters } = chainConfig[options.chain];

  const logs = [
    ...(await options.getLogs({ targets: routers, eventAbi: ORDER_RECORD_EVENT })),
    ...(await options.getLogs({ targets: legacyRouters, eventAbi: LEGACY_ORDER_RECORD_EVENT })),
  ];

  logs.forEach((log: any) => {
    // Native BNB/ETH is logged as the zero address
    if (log.inputToken.toLowerCase() === ADDRESSES.null) dailyVolume.addGasToken(log.inputAmount);
    else dailyVolume.add(log.inputToken, log.inputAmount);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Input amount of every swap settled through the PancakeSwap Aggregator router, read from its OrderRecord events.",
  },
};

export default adapter;
