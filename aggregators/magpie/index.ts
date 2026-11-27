import { postURL } from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted, getDefaultDexTokensWhitelisted } from "../../helpers/lists";
import { isCoreAsset } from "../../helpers/prices";
import { nullAddress } from "../../helpers/token";
import { formatAddress } from "../../utils/utils";

// fly.trade migrated to DexAggregator routers on 2026-05-03 (see fees/fly-trade)
const MIGRATION_TS = 1777766400; // 2026-05-03
const NATIVE_EVM = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

// DexAggregator router addresses. Source: https://docs.fly.trade/developers/deployments
const ROUTER_A = "0x20f6ee51340adeed01a59b0e65cb3703f3dc860c"; // default deployment (most chains)
const ROUTER_B = "0xf5f3b8faf45023fd92c0c88fedf73fb0529fc1cd"; // polygon_zkevm, taiko, telos
const ROUTER_C = "0xc5b20203b6807e742853c96ce7dcfb1e7b201c0a"; // zksync era
const ROUTER_D = "0xf702814d2e1290f3d5f3202565df46272e1b1b92"; // metis, fantom

const EVM_ROUTERS: { [chain: string]: string } = {
  [CHAIN.ETHEREUM]: ROUTER_A,
  [CHAIN.ARBITRUM]: ROUTER_A,
  [CHAIN.POLYGON]: ROUTER_A,
  [CHAIN.AVAX]: ROUTER_A,
  [CHAIN.BSC]: ROUTER_A,
  [CHAIN.OPTIMISM]: ROUTER_A,
  [CHAIN.BASE]: ROUTER_A,
  [CHAIN.SCROLL]: ROUTER_A,
  [CHAIN.MANTA]: ROUTER_A,
  [CHAIN.TAIKO]: ROUTER_B,
  // [CHAIN.POLYGON_ZKEVM]: ROUTER_B, // public RPC chronically stale (same as fees/fly-trade)
  [CHAIN.METIS]: ROUTER_D,
  [CHAIN.FANTOM]: ROUTER_D,
  [CHAIN.SONIC]: ROUTER_A,
  [CHAIN.ERA]: ROUTER_C,
  [CHAIN.BERACHAIN]: ROUTER_A,
  [CHAIN.LINEA]: ROUTER_A,
  [CHAIN.INK]: ROUTER_A,
  [CHAIN.ABSTRACT]: ROUTER_A,
  [CHAIN.UNICHAIN]: ROUTER_A,
  [CHAIN.HYPERLIQUID]: ROUTER_A,
  [CHAIN.PLASMA]: ROUTER_A,
  [CHAIN.MONAD]: ROUTER_A,
  [CHAIN.MEGAETH]: ROUTER_A,
  [CHAIN.MORPH]: ROUTER_A,
  [CHAIN.KATANA]: ROUTER_A,
  [CHAIN.TELOS]: ROUTER_B,
  [CHAIN.ROBINHOOD]: ROUTER_A,
};

const SWAP_EVENT =
  "event Swap(address fromAddress, address toAddress, address fromAssetAddress, address toAssetAddress, uint256 amountIn, uint256 amountOut, uint256 expectedAmountOut, uint256 amountInSurplus, uint256 amountOutSurplus, bytes32 consumerId, address[] swapFeeAssetAddresses, address[] swapFeeReceivers, uint256[] swapFeeAmounts)";

const isNativeOrCore = (chain: string, asset: string): boolean =>
  asset === nullAddress || asset === NATIVE_EVM || isCoreAsset(chain, asset);

const inflatedVolumes: { [key: string]: string[] } = {
  [CHAIN.ETHEREUM]: ["2026-04-18","2026-04-19", "2026-04-28", "2026-06-02"],
  [CHAIN.BSC]: ["2026-06-03", "2026-06-04", "2026-06-17", "2026-06-26", "2026-06-27", "2026-09-10"],
  [CHAIN.BASE]: ["2026-06-26"],
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { chain, startOfDay, dateString, startTimestamp } = options;
  const router = EVM_ROUTERS[chain];

  if (router && startTimestamp >= MIGRATION_TS) {
    const dailyVolume = options.createBalances();
    const blacklisted = new Set(getDefaultDexTokensBlacklisted(chain));
    const whitelisted = new Set(await getDefaultDexTokensWhitelisted({ chain }));
    const logs = await options.getLogs({ target: router, eventAbi: SWAP_EVENT });

    for (const log of logs) {
      const fromAsset = formatAddress(log.fromAssetAddress);
      const toAsset = formatAddress(log.toAssetAddress);
      if (blacklisted.has(fromAsset) || blacklisted.has(toAsset)) continue;

      if (isNativeOrCore(chain, fromAsset)) {
        dailyVolume.add(log.fromAssetAddress, log.amountIn);
      } else if (isNativeOrCore(chain, toAsset)) {
        dailyVolume.add(log.toAssetAddress, log.amountOut);
      } else if (whitelisted.size === 0 || whitelisted.has(fromAsset)) {
        dailyVolume.add(log.fromAssetAddress, log.amountIn);
      } else if (whitelisted.has(toAsset)) {
        dailyVolume.add(log.toAssetAddress, log.amountOut);
      }
    }

    return { dailyVolume };
  }

  if (inflatedVolumes[chain] && inflatedVolumes[chain].includes(dateString)) {
    return {
      dailyVolume: 0,
    };
  }
  const unixTimestamp = getTimestampAtStartOfDayUTC(startOfDay)
  const data = await postURL(`https://prewimvk04.execute-api.us-west-1.amazonaws.com/prod/llama`, { timestamp: unixTimestamp, chain: chain }, 10);
  const chainData = data.result
  if (chainData === undefined) {
    return {
      dailyVolume: 0,
    };
  } else {
    return {
      dailyVolume: chainData.dailyVolume,
    };
  }
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.SCROLL]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.MANTA]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.TAIKO]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch,
      start: '2022-09-08',
    },
    // [CHAIN.BLAST]: {
    //   fetch,
    //   start: '2022-09-08',
    // },
    [CHAIN.METIS]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.FANTOM]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.SONIC]: {
      fetch,
      start: '2024-12-26',
    },
    [CHAIN.ERA]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.BERACHAIN]: {
      fetch,
      start: '2025-02-10',
    },
    [CHAIN.LINEA]: {
      fetch,
      start: '2025-02-11',
    },
    [CHAIN.INK]: {
      fetch,
      start: '2025-02-11',
    },    
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.UNICHAIN]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-10-01',
    },
    [CHAIN.PLASMA]: {
      fetch,
      start: '2025-10-01',
    },
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-11-15',
    },
    [CHAIN.MONAD]: {
      fetch,
      start: '2025-11-22',
    },
    [CHAIN.MEGAETH]: {
      fetch,
      start: '2026-01-30',
    },
    [CHAIN.MORPH]: {
      fetch,
      start: '2026-01-13',
    },
    [CHAIN.FOGO]: {
      fetch,
      start: '2026-04-01',
    },    
    [CHAIN.KATANA]: {
      fetch,
      start: '2026-04-01',
    },    
    [CHAIN.TELOS]: {
      fetch,
      start: '2026-04-01',
    },
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2026-07-01',
    },
    [CHAIN.ARC]: {
      fetch,
      start: '2026-09-01',
    },
  },
};

export default adapter;
