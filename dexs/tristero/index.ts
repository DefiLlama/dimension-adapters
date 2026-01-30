import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const event_order_filled = 'event OrderFilled(bytes32 indexed orderUUID,string orderType,address target,address filler,address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity)';

// Old router (Dec 2025 - Jan 2026)
const OLD_V2_ORDER_ROUTER = '0x98888e2e040944cee3d7c8da22368aef18f5a3f4';
// New router (Jan 2026 - present)
const NEW_V2_ORDER_ROUTER = '0x90000069af5a354cf1dC438dEFbF8e0469d87F02';

const chainConfig = {
  [CHAIN.ETHEREUM]: { start: "2025-08-30" },
  [CHAIN.ARBITRUM]: { start: "2025-08-18" },
  [CHAIN.OPTIMISM]: { start: "2025-08-18" },
  [CHAIN.BASE]: { start: "2025-08-18" },
  [CHAIN.POLYGON]: { start: "2025-08-30" },
  [CHAIN.AVAX]: { start: "2025-08-18" },
  [CHAIN.LINEA]: { start: "2025-09-20" },
  [CHAIN.UNICHAIN]: { start: "2025-11-27" },
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chain = options.chain;

  // Query both old and new router contracts to capture all volume
  const [oldLogs, newLogs] = await Promise.all([
    options.getLogs({
      target: OLD_V2_ORDER_ROUTER,
      eventAbi: event_order_filled,
      onlyArgs: true,
    }),
    options.getLogs({
      target: NEW_V2_ORDER_ROUTER,
      eventAbi: event_order_filled,
      onlyArgs: true,
    }),
  ]);

  const allLogs = [...oldLogs, ...newLogs];

  allLogs.forEach((log: any) => {
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
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, config]) => [
      chain,
      { fetch, start: config.start }
    ])
  ),
};

export default adapter;
