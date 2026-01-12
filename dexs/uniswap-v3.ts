import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";
import { filterPools, getUniV3LogAdapter } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";

const v3Endpoints = {
  // [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('5AXe97hGLfjgFAc6Xvg6uDpsD5hqpxrxcma9MoxG7j7h'),
  // [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('Jhu62RoQqrrWoxUUhWFkiMHDrqsTe7hTGb3NGiHPuf9'),
  // [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/id/QmZ5uwhnwsJXAQGYEF8qKPQ85iVhYAcVZcZAPfrF7ZNb9z",
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('3V7ZY6muhxaQL5qvntX1CFXJ32W7BxXZTGTwmpH5J4t3'),
  // [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm'),
  // [CHAIN.CELO]: sdk.graph.modifyEndpoint('ESdrTJ3twMwWVoQ1hUE2u7PugEHX3QkenudD6aXCkDQ4'),
  // [CHAIN.BSC]: sdk.graph.modifyEndpoint('F85MNzUGYqgSHSHRGgeVMNsdnW1KtZSVgFULumXRZTw2'), // use oku
  // [CHAIN.AVAX]: sdk.graph.modifyEndpoint('9EAxYE17Cc478uzFXRbM7PVnMUSsgb99XZiGxodbtpbk'),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1'),
  // [CHAIN.ERA]: "https://api.thegraph.com/subgraphs/name/freakyfractal/uniswap-v3-zksync-era",
  // [CHAIN.UNICHAIN]: sdk.graph.modifyEndpoint('BCfy6Vw9No3weqVq9NhyGo4FkVCJep1ZN9RMJj5S32fX')
};

type TStartTime = {
  [key: string]: number;
}
const startTimeV3: TStartTime = {
  [CHAIN.ETHEREUM]: 1620172800,
  [CHAIN.OPTIMISM]: 1636675200,
  [CHAIN.ARBITRUM]: 1630368000,
  [CHAIN.POLYGON]: 1640044800,
  [CHAIN.CELO]: 1657324800,
  [CHAIN.BSC]: 1678665600,
  [CHAIN.AVAX]: 1689033600,
  [CHAIN.BASE]: 1691280000,
  [CHAIN.ERA]: 1693440000
}

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 100% of collected fees
  }
});

const uniLogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
}

interface IOkuResponse {
  volume: number;
  fees: number;
}
const fetchFromOku = async (options: FetchOptions) => {
  try {
    const url = `https://omni.icarus.tools/${mappingChain(options.chain)}/cush/analyticsProtocolHistoric`;
    const body = {
      "params": [
        options.startTimestamp * 1000, //start
        options.endTimestamp * 1000, //end
        3600000 //interval
      ]
    }
    const response: IOkuResponse[] = (await httpPost(url, body)).result
    const dailyVolume = response.reduce((acc, item) => acc + item.volume, 0);
    const dailyFees = response.reduce((acc, item) => acc + item.fees, 0);
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue: dailyFees,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue: 0,
    }
  } catch (e) {
    console.error(options.chain, e)
    return {}
  }
}
const mappingChain = (chain: string) => {
  if (chain === CHAIN.ERA) return "zksync"
  if (chain === CHAIN.ROOTSTOCK) return "rootstock"
  if (chain === CHAIN.POLYGON_ZKEVM) return "polygon-zkevm"
  if (chain === CHAIN.XDAI) return "gnosis"
  if (chain === CHAIN.LIGHTLINK_PHOENIX) return "lightlink"
  if (chain === CHAIN.SONIC) return "sonic"
  if (chain === CHAIN.ETHERLINK) return "etherlink"
  if (chain === CHAIN.NIBIRU) return "nibiru"
  if (chain === CHAIN.MONAD) return "monad"
  return chain
}

const methodology = {
  Fees: "Swap fees from paid by users.",
  UserFees: "User pays fees on each swap.",
  Revenue: 'From 28 Dec 2025, a portion of fees a collected to buy back and burn UNI.',
  ProtocolRevenue: 'Protocol make no revenue.',
  SupplySideRevenue: 'All fees are distributed to LPs.',
  HoldersRevenue: 'From 28 Dec 2025, a portion of fees a collected to buy back and burn UNI.',
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: Object.keys(v3Endpoints).reduce((acc, chain) => {
    acc[chain] = {
      fetch: async (_t: any, _tb: any, options: FetchOptions) => v3Graphs(options),
      start: startTimeV3[chain],
    }
    return acc
  }, {} as BaseAdapter)
};

(adapter.adapter as BaseAdapter)[CHAIN.AVAX] = {
  fetch: async (_t: any, _tb: any, options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD", ...uniLogAdapterConfig })
    const response = await adapter(options)
    return response;
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.WC] = {
  fetch: async (_t: any, _tb: any, options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x7a5028BDa40e7B173C278C5342087826455ea25a", ...uniLogAdapterConfig })
    const response = await adapter(options)
    return response;
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.PLASMA] = {
  fetch: async (_t: any, _tb: any, options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0xcb2436774C3e191c85056d248EF4260ce5f27A9D", ...uniLogAdapterConfig })
    const response = await adapter(options)
    return response;
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.BLAST] = {
  fetch: async (_t: any, _tb: any, options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x792edAdE80af5fC680d96a2eD80A44247D2Cf6Fd", ...uniLogAdapterConfig })
    const response = await adapter(options)
    return response;
  },
};

// (adapter.adapter as BaseAdapter)[CHAIN.NIBIRU] = {
//   fetch: async (_t: any, _tb: any, options: FetchOptions) => {
//     const adapter = getUniV3LogAdapter({ factory: "0x346239972d1fa486FC4a521031BC81bFB7D6e8a4", ...uniLogAdapterConfig })
//     const response = await adapter(options)
//     return response;
//   },
// };

const okuChains = [
  CHAIN.ETHEREUM,
  CHAIN.OPTIMISM,
  CHAIN.POLYGON,
  CHAIN.ERA,
  CHAIN.SEI,
  CHAIN.UNICHAIN,
  CHAIN.TAIKO,
  CHAIN.SCROLL,
  CHAIN.ROOTSTOCK,
  CHAIN.FILECOIN,
  CHAIN.BOBA,
  CHAIN.MANTLE,
  CHAIN.LINEA,
  CHAIN.XDAI,
  CHAIN.BOB,
  CHAIN.CORN,
  CHAIN.GOAT,
  CHAIN.BSC,
  CHAIN.HEMI,
  CHAIN.XDC,
  CHAIN.LIGHTLINK_PHOENIX,
  CHAIN.TELOS,
  CHAIN.CELO,
  CHAIN.NIBIRU,
  CHAIN.MONAD,
  CHAIN.SONIC,
  CHAIN.ETHERLINK,
  CHAIN.SAGA,
  CHAIN.LENS,

  // CHAIN.BLAST,
  // CHAIN.LISK,
  // CHAIN.MOONBEAM,
  // CHAIN.POLYGON_ZKEVM,
  // CHAIN.MANTA,
]



okuChains.forEach(chain => {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: async (_t: any, _tb: any, options: FetchOptions) => fetchFromOku(options),
  }
});


const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)';
(adapter.adapter as BaseAdapter)[CHAIN.ETHEREUM] = {
  fetch: async (_t: any, _tb: any, options: FetchOptions) => {
    function getRevenueShare(fee: number): number {
      // https://docs.uniswap.org/contracts/protocol-fee/fee-setting-rational
      if (fee === 0.0001) return 0.000025;
      if (fee === 0.0005) return 0.0000125;
      if (fee === 0.003) return 0.0005;
      if (fee === 0.01) return 0.001666;
      return 0;
    }
    
    const poolCreatedLogs = await options.getLogs({
      target: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      eventAbi: poolCreatedEvent,
      fromBlock: 12369621,
      cacheInCloud: true,
    })

    const pairObject: IJSON<string[]> = {}
    const fees: any = {}
    const revenueShares: any = {}
  
    poolCreatedLogs.forEach((log: any) => {
      pairObject[log.pool] = [log.token0, log.token1]
      fees[log.pool] = (log.fee?.toString() || 0) / 1e6
      revenueShares[log.pool] = getRevenueShare(Number(log.fee?.toString() || 0) / 1e6)
    })
    
    const filteredPairs = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances })
    
    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
  
    if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees }
  
    const allLogs = await options.getLogs({ targets: Object.keys(filteredPairs), eventAbi: poolSwapEvent, flatten: false })
    allLogs.map((logs: any, index) => {
      if (!logs.length) return;
      const pair = Object.keys(filteredPairs)[index]
      const [token0, token1] = pairObject[pair]
      const fee = fees[pair]
      const revenueRatio = revenueShares[pair]
      logs.forEach((log: any) => {
        addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
        addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee })
        addOneToken({ chain: options.chain, balances: dailyRevenue, token0, token1, amount0: log.amount0.toString() * revenueRatio, amount1: log.amount1.toString() * revenueRatio })
        addOneToken({ chain: options.chain, balances: dailySupplySideRevenue, token0, token1, amount0: log.amount0.toString() * (fee - revenueRatio), amount1: log.amount1.toString() * (fee - revenueRatio) })
      })
    })
  
    return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: 0, dailyHoldersRevenue: dailyRevenue, }
  },
};

export default adapter;
