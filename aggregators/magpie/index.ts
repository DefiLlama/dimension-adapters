import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { isCoreAsset } from "../../helpers/prices";
import { formatAddress } from "../../utils/utils";

const ROUTER_MIGRATION_TS = 1777766400; // 2026-05-03, as in fees/fly-trade

// DexAggregator router addresses. Source: https://docs.fly.trade/developers/deployments
const ROUTER_A = "0x20f6ee51340adeed01a59b0e65cb3703f3dc860c";
const ROUTER_B = "0xf5f3b8faf45023fd92c0c88fedf73fb0529fc1cd";
const ROUTER_C = "0xc5b20203b6807e742853c96ce7dcfb1e7b201c0a";
const ROUTER_D = "0xf702814d2e1290f3d5f3202565df46272e1b1b92";

const chainConfig: Record<string, { router: string; start: string }> = {
  [CHAIN.ETHEREUM]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.ARBITRUM]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.POLYGON]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.AVAX]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.BSC]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.OPTIMISM]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.BASE]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.SCROLL]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.MANTA]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.TAIKO]: { router: ROUTER_B, start: "2022-09-08" },
  // [CHAIN.POLYGON_ZKEVM]: { router: ROUTER_B, start: "2022-09-08" }, // public RPC chronically stale, as in fees/fly-trade
  // [CHAIN.BLAST]: { router: ROUTER_A, start: "2022-09-08" },
  [CHAIN.METIS]: { router: ROUTER_D, start: "2022-09-08" },
  [CHAIN.FANTOM]: { router: ROUTER_D, start: "2022-09-08" },
  [CHAIN.SONIC]: { router: ROUTER_A, start: "2024-12-26" },
  [CHAIN.ERA]: { router: ROUTER_C, start: "2022-09-08" },
  [CHAIN.BERACHAIN]: { router: ROUTER_A, start: "2025-02-10" },
  [CHAIN.LINEA]: { router: ROUTER_A, start: "2025-02-11" },
  [CHAIN.INK]: { router: ROUTER_A, start: "2025-02-11" },
  [CHAIN.ABSTRACT]: { router: ROUTER_A, start: "2025-07-01" },
  [CHAIN.UNICHAIN]: { router: ROUTER_A, start: "2025-07-01" },
  [CHAIN.HYPERLIQUID]: { router: ROUTER_A, start: "2025-10-01" },
  [CHAIN.PLASMA]: { router: ROUTER_A, start: "2025-10-01" },
  // [CHAIN.SOLANA]: { start: "2025-11-15" }, // not on the EVM routers; fly's volume API returns 0 for every date
  [CHAIN.MONAD]: { router: ROUTER_A, start: "2025-11-22" },
  [CHAIN.MEGAETH]: { router: ROUTER_A, start: "2026-01-30" },
  [CHAIN.MORPH]: { router: ROUTER_A, start: "2026-01-13" },
  [CHAIN.KATANA]: { router: ROUTER_A, start: "2026-04-01" },
  [CHAIN.TELOS]: { router: ROUTER_B, start: "2026-04-01" },
  [CHAIN.ROBINHOOD]: { router: ROUTER_A, start: "2026-07-01" },
  [CHAIN.ARC]: { router: ROUTER_A, start: "2026-09-01" },
};

const SWAP_EVENT =
  "event Swap(address fromAddress, address toAddress, address fromAssetAddress, address toAssetAddress, uint256 amountIn, uint256 amountOut, uint256 expectedAmountOut, uint256 amountInSurplus, uint256 amountOutSurplus, bytes32 consumerId, address[] swapFeeAssetAddresses, address[] swapFeeReceivers, uint256[] swapFeeAmounts)";

const isNativeOrCore = (chain: string, asset: string) =>
  asset === ADDRESSES.null || asset === ADDRESSES.GAS_TOKEN_2 || isCoreAsset(chain, asset);

const fetch = async (options: FetchOptions) => {
  // Stored history before the router migration came from fly's volume API, which now returns 0 for every date.
  if (options.startTimestamp < ROUTER_MIGRATION_TS) throw new Error("magpie: no volume source before 2026-05-03");

  const dailyVolume = options.createBalances();
  const blacklisted = new Set(getDefaultDexTokensBlacklisted(options.chain));
  const logs = await options.getLogs({ target: chainConfig[options.chain].router, eventAbi: SWAP_EVENT });

  for (const log of logs) {
    const fromAsset = formatAddress(log.fromAssetAddress);
    const toAsset = formatAddress(log.toAssetAddress);
    if (blacklisted.has(fromAsset) || blacklisted.has(toAsset)) continue;

    if (isNativeOrCore(options.chain, fromAsset)) dailyVolume.add(fromAsset, log.amountIn);
    else if (isNativeOrCore(options.chain, toAsset)) dailyVolume.add(toAsset, log.amountOut);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Value of swaps routed through fly.trade's DexAggregator routers, from each router Swap event, counted on the side that is a native or core asset. Swaps with no native or core side, and swaps of tokens on DefiLlama's default DEX blacklist, are left out. Volume before the 2026-05-03 router migration was reported by fly.trade's API.",
  },
};

export default adapter;
