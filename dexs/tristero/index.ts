import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const event_order_filled = 'event OrderFilled(bytes32 indexed orderUUID,string orderType,address target,address filler,address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity)';
const V2_ORDER_ROUTER_ADDRESS = '0x98888e2e040944cee3d7c8da22368aef18f5a3f4';

const chainConfig = {
  [CHAIN.ETHEREUM]: { start: "2025-08-30", address: V2_ORDER_ROUTER_ADDRESS },
  [CHAIN.ARBITRUM]: { start: "2025-08-18", address: V2_ORDER_ROUTER_ADDRESS },
  [CHAIN.OPTIMISM]: { start: "2025-08-18", address: V2_ORDER_ROUTER_ADDRESS },
  [CHAIN.BASE]: { start: "2025-08-18", address: V2_ORDER_ROUTER_ADDRESS },
  [CHAIN.POLYGON]: { start: "2025-08-30", address: V2_ORDER_ROUTER_ADDRESS },
  [CHAIN.AVAX]: { start: "2025-08-18", address: V2_ORDER_ROUTER_ADDRESS },
  [CHAIN.LINEA]: { start: "2025-09-20", address: V2_ORDER_ROUTER_ADDRESS },
  [CHAIN.UNICHAIN]: { start: "2025-11-27", address: V2_ORDER_ROUTER_ADDRESS},
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chain = options.chain;

  const logs = await options.getLogs({
    target: chainConfig[chain].address,
    eventAbi: event_order_filled,
    onlyArgs: true,
  });

  logs.forEach((log: any) => {
    if (log.srcAsset && log.srcQuantity) {
      let tokenAddress = log.srcAsset.toLowerCase();
      if (tokenAddress === '0x0000000000000000000000000000000000000000' || tokenAddress === 'native') {
        const wrappedToken = chain == CHAIN.AVAX ? ADDRESSES[chain]?.WAVAX : ADDRESSES[chain]?.WETH;
        if (!wrappedToken) return;
        tokenAddress = wrappedToken.toLowerCase();
      }
      dailyVolume.add(tokenAddress, log.srcQuantity);
    }
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
};

export default adapter;
