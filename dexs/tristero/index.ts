import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const event_order_filled = 'event OrderFilled(bytes32 indexed orderUUID,string orderType,address target,address filler,address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity)';

type RouterConfig = {
  address: string;
  start: string;
  end?: string;
};

// v2_order_router contract addresses (same across all chains, updated over time)
const ROUTER_SCHEDULE: RouterConfig[] = [
  { address: '0x98888e2e040944cee3d7c8da22368aef18f5a3f4', start: '2025-12-01', end: '2026-01-14' }, // Router v1
  { address: '0x90000069af5a354cf1dC438dEFbF8e0469d87F02', start: '2026-01-15', end: '2026-01-31' }, // Router v2
  { address: '0x900000D231B9C5c2374415f0974C1F8a377757E9', start: '2026-02-01', end: '2026-02-28' }, // Router v3
  { address: '0x4b000001c0be947f4238620f57cbd07421007f43', start: '2026-03-01', end: '2026-04-01' }, // Router v4
  { address: '0x4d00000075eFB197178E05aeFF759c5c20d3F32d', start: '2026-04-02', end: '2026-04-14' }, // Router v5
  { address: '0x4e00000193B7Ba7F9e6EB8019373d27e9F0Af80c', start: '2026-04-15' }, // Router v6
];

const chainConfig = {
  [CHAIN.ABSTRACT]: { start: "2025-08-18" },
  [CHAIN.APECHAIN]: { start: "2025-08-18" },
  [CHAIN.BERACHAIN]: { start: "2025-08-18" },
  [CHAIN.BOB]: { start: "2025-08-18" },
  [CHAIN.ETHEREUM]: { start: "2025-08-30" },
  [CHAIN.ARBITRUM]: { start: "2025-08-18" },
  [CHAIN.XDAI]: { start: "2025-08-18" },
  [CHAIN.INK]: { start: "2025-11-27" },
  [CHAIN.MANTLE]: { start: "2025-08-18" },
  [CHAIN.MODE]: { start: "2025-08-18" },
  [CHAIN.MONAD]: { start: "2025-11-24" },
  [CHAIN.OPTIMISM]: { start: "2025-08-18" },
  [CHAIN.BASE]: { start: "2025-08-18" },
  [CHAIN.POLYGON]: { start: "2025-08-30" },
  [CHAIN.RONIN]: { start: "2025-08-18" },
  [CHAIN.SCROLL]: { start: "2025-08-18" },
  [CHAIN.SONIC]: { start: "2025-08-18" },
  [CHAIN.AVAX]: { start: "2025-08-18" },
  [CHAIN.LINEA]: { start: "2025-09-20" },
  [CHAIN.UNICHAIN]: { start: "2025-11-27" },
}

const WRAPPED_NATIVE_TOKENS: Record<string, string | undefined> = {
  [CHAIN.APECHAIN]: ADDRESSES[CHAIN.APECHAIN]?.WAPE,
  [CHAIN.AVAX]: ADDRESSES[CHAIN.AVAX]?.WAVAX,
  [CHAIN.BERACHAIN]: ADDRESSES[CHAIN.BERACHAIN]?.WBERA,
  [CHAIN.MANTLE]: ADDRESSES[CHAIN.MANTLE]?.WMNT,
  [CHAIN.MONAD]: ADDRESSES[CHAIN.MONAD]?.WMON,
  [CHAIN.RONIN]: ADDRESSES[CHAIN.RONIN]?.WRON,
  [CHAIN.SONIC]: ADDRESSES[CHAIN.SONIC]?.wS,
  [CHAIN.XDAI]: ADDRESSES[CHAIN.XDAI]?.WXDAI,
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chain = options.chain;
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const activeRouters = ROUTER_SCHEDULE
    .filter(({ start, end }) => date >= start && (!end || date <= end))
    .map(({ address }) => address);

  // Query OrderFilled events from the router contract version active for the indexed day.
  const logsPerRouter = await Promise.all(
    activeRouters.map((router) =>
      options.getLogs({
        target: router,
        eventAbi: event_order_filled,
        onlyArgs: true,
      })
    )
  );
  const allLogs = logsPerRouter.flat();

  allLogs.forEach((log: any) => {
    if (log.srcAsset && log.srcQuantity) {
      let tokenAddress = log.srcAsset.toLowerCase();
      if (tokenAddress === '0x0000000000000000000000000000000000000000' || tokenAddress === 'native') {
        const wrappedToken = WRAPPED_NATIVE_TOKENS[chain] ?? ADDRESSES[chain]?.WETH;
        if (!wrappedToken) return;
        tokenAddress = wrappedToken.toLowerCase();
      }
      dailyVolume.add(tokenAddress, log.srcQuantity);
    }
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, config]) => [
      chain,
      { fetch, start: config.start }
    ])
  ),
};

export default adapter;
