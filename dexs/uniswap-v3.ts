import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { BaseAdapter, Dependencies, FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";
import { filterPools, getUniV3LogAdapter } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";
import { getDefaultDexTokensWhitelisted } from "../helpers/lists";
import { queryDune } from "../helpers/dune";
import { formatAddress } from "../utils/utils";

const v3Endpoints = {
  // [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('5AXe97hGLfjgFAc6Xvg6uDpsD5hqpxrxcma9MoxG7j7h'),
  // [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('Jhu62RoQqrrWoxUUhWFkiMHDrqsTe7hTGb3NGiHPuf9'),
  // [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/id/QmZ5uwhnwsJXAQGYEF8qKPQ85iVhYAcVZcZAPfrF7ZNb9z",
  // [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('3V7ZY6muhxaQL5qvntX1CFXJ32W7BxXZTGTwmpH5J4t3'),
  // [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm'),
  // [CHAIN.CELO]: sdk.graph.modifyEndpoint('ESdrTJ3twMwWVoQ1hUE2u7PugEHX3QkenudD6aXCkDQ4'),
  // [CHAIN.BSC]: sdk.graph.modifyEndpoint('F85MNzUGYqgSHSHRGgeVMNsdnW1KtZSVgFULumXRZTw2'), // use oku
  // [CHAIN.AVAX]: sdk.graph.modifyEndpoint('9EAxYE17Cc478uzFXRbM7PVnMUSsgb99XZiGxodbtpbk'),
  // [CHAIN.BASE]: sdk.graph.modifyEndpoint('HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1'),
  // [CHAIN.ERA]: "https://api.thegraph.com/subgraphs/name/freakyfractal/uniswap-v3-zksync-era",
  [CHAIN.UNICHAIN]: sdk.graph.modifyEndpoint('BCfy6Vw9No3weqVq9NhyGo4FkVCJep1ZN9RMJj5S32fX'),
  //[CHAIN.XLAYER]: sdk.graph.modifyEndpoint('2LM2nhSfVsKVNW1EF6AgJHMGBKU2zR9rZcE3zzkFkwW1'),
};

type TStartTime = {
  [key: string]: string;
}
const startTimeV3: TStartTime = {
  [CHAIN.ETHEREUM]: '2021-05-05',
  [CHAIN.OPTIMISM]: '2021-11-12',
  [CHAIN.ARBITRUM]: '2021-08-31',
  [CHAIN.POLYGON]: '2021-12-21',
  [CHAIN.CELO]: '2022-07-09',
  [CHAIN.BSC]: '2023-03-13',
  [CHAIN.AVAX]: '2023-07-11',
  [CHAIN.BASE]: '2023-08-06',
  [CHAIN.ERA]: '2023-08-31',
  [CHAIN.XLAYER]: '2026-01-05',
}

const FEE_SWITCH_DATE: Record<string, string> = {
  [CHAIN.ETHEREUM]: "2025-12-29",
  [CHAIN.OPTIMISM]: "2026-03-08",
  [CHAIN.ARBITRUM]: "2026-03-08",
  [CHAIN.BASE]: "2026-03-08",
  [CHAIN.CELO]: "2026-06-02",
  [CHAIN.WC]: "2026-03-08",
  [CHAIN.ZORA]: "2026-03-08",
  [CHAIN.XLAYER]: "2026-03-08",
  [CHAIN.BSC]: "2026-06-02",
  [CHAIN.POLYGON]: "2026-06-02",
}

const FIREPIT : Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x0D5Cd355e2aBEB8fb1552F56c965B867346d6721',
  [CHAIN.UNICHAIN]: '0xe0A780E9105aC10Ee304448224Eb4A2b11A77eeB',
  [CHAIN.WC]: '0x455e844D286631566cF98D6cb2996149734618C6',
  [CHAIN.CELO]: '0x2758FbaA228D7d3c41dD139F47dab1a27bF9bc25',
  [CHAIN.ZORA]: '0x2f98eD4D04e633169FbC941BFCc54E785853b143',
  [CHAIN.XLAYER]: '0xe122E231cb52aea99690963Fd73E91e33E97468f',
  [CHAIN.ARBITRUM]: '0xB8018422bcE25D82E70cB98FdA96a4f502D89427',
  [CHAIN.OPTIMISM]: '0x94460443Ca27FFC1baeCa61165fde18346C91AbD',
  [CHAIN.BASE]: '0xFf77c0ED0B6b13A20446969107E5867abc46f53a',
  [CHAIN.BSC]: '0xa59FfbB55D91Fc32b44A06F0b9cc6036a4afbcE2',
  [CHAIN.POLYGON]: '0xa59FfbB55D91Fc32b44A06F0b9cc6036a4afbcE2',
}

const THRESHOLD_FUNCTION_ABI = 'uint256:threshold'
const RELEASED_EVENT_ABI = 'event Released (uint256 indexed nonce, address indexed recipient, address[] assets)'

async function fetchHoldersRevenue(options: FetchOptions) {
  const dailyHoldersRevenue = options.createBalances()
  const firepit = FIREPIT[options.chain]
  if (!firepit || !FEE_SWITCH_DATE[options.chain] || options.dateString < FEE_SWITCH_DATE[options.chain]) {
    return dailyHoldersRevenue
  }

  const [releaseLogs, threshold] = await Promise.all([
    options.getLogs({ target: firepit, eventAbi: RELEASED_EVENT_ABI }),
    options.api.call({ target: firepit, abi: THRESHOLD_FUNCTION_ABI }),
  ])

  if (!releaseLogs.length || !threshold) return dailyHoldersRevenue

  const amount = Number(releaseLogs.length) * Number(threshold) / 1e18
  dailyHoldersRevenue.addCGToken("uniswap", amount)
  return dailyHoldersRevenue
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
    const dailyRevenue = dailyFees * getRevenueShare(dailyFees, options);
    const dailyHoldersRevenue = await fetchHoldersRevenue(options);
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue: dailyFees - dailyRevenue,
      dailyRevenue,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue,
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
  Revenue: 'From 28 Dec 2025, a portion of fees a collected to buy back and burn UNI on Ethereum, From 8 Mar 2026, on Optimism, Arbitrum, Base, WC, Zora, XLayer, From 2 Jun 2026, on Polygon, BSC, Celo.',
  ProtocolRevenue: 'Protocol make no revenue.',
  SupplySideRevenue: 'Fees distributed to LPs post protocol fee collection',
  HoldersRevenue: 'From 28 Dec 2025, a portion of fees a collected to buy back and burn UNI on Ethereum, From 8 Mar 2026, on Optimism, Arbitrum, Base, WC, Zora, XLayer, From 2 Jun 2026, on Polygon, BSC, Celo.',
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  dependencies: [Dependencies.DUNE],
  adapter: Object.keys(v3Endpoints).reduce((acc, chain) => {
    acc[chain] = {
      fetch: async (options: FetchOptions) => v3Graphs(options),
      start: startTimeV3[chain],
    }
    return acc
  }, {} as BaseAdapter)
};

const okuChains = [
  //CHAIN.OPTIMISM,
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
  CHAIN.HEMI,
  CHAIN.XDC,
  CHAIN.LIGHTLINK_PHOENIX,
  CHAIN.TELOS,
  //CHAIN.CELO,
  CHAIN.NIBIRU,
  CHAIN.MONAD,
  CHAIN.SONIC,
  CHAIN.ETHERLINK,
  CHAIN.SAGA,
  CHAIN.LENS,
  
  // CHAIN.ETHEREUM,
  // CHAIN.BSC,

  // CHAIN.BLAST,
  // CHAIN.LISK,
  // CHAIN.MOONBEAM,
  // CHAIN.POLYGON_ZKEVM,
  // CHAIN.MANTA,
]



okuChains.forEach(chain => {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: async (options: FetchOptions) => fetchFromOku(options),
  }
});


(adapter.adapter as BaseAdapter)[CHAIN.AVAX] = {
  fetch: async (options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD", ...uniLogAdapterConfig })
    const response = await adapter(options)
    return response;
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.PLASMA] = {
  fetch: async (options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0xcb2436774C3e191c85056d248EF4260ce5f27A9D", ...uniLogAdapterConfig })
    const response = await adapter(options)
    return response;
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.BLAST] = {
  fetch: async (options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x792edAdE80af5fC680d96a2eD80A44247D2Cf6Fd", ...uniLogAdapterConfig })
    const response = await adapter(options)
    return response;
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.NIBIRU] = {
  fetch: async (options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x346239972d1fa486FC4a521031BC81bFB7D6e8a4", ...uniLogAdapterConfig })
    const response = await adapter(options)
    return response;
  },
};

const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)';

async function customUniswapGetLogsAdapter(props: { options: FetchOptions, factory: string, fromBlock: number, getRevenueShare?: (fee: number, options: FetchOptions) => number, onlyWhitelisedTokens?: boolean }) {
  const { options, factory, fromBlock, getRevenueShare, onlyWhitelisedTokens } = props;
  
  const whitelistedTokens: Array<string> | undefined = onlyWhitelisedTokens ? await getDefaultDexTokensWhitelisted({ chain: options.chain }) : undefined;
  const poolCreatedLogs = await props.options.getLogs({
    target: factory,
    eventAbi: poolCreatedEvent,
    fromBlock: fromBlock,
    cacheInCloud: true,
  })
  
  const pairObject: IJSON<string[]> = {}
  const fees: any = {}
  const revenueShares: any = {}

  poolCreatedLogs.forEach((log: any) => {
    // filter out pools without whitelisted tokens
    if (whitelistedTokens && (!whitelistedTokens.includes(formatAddress(log.token0)) || !whitelistedTokens.includes(formatAddress(log.token1)))) return;
    
    pairObject[log.pool] = [log.token0, log.token1]
    fees[log.pool] = (log.fee?.toString() || 0) / 1e6
    revenueShares[log.pool] = getRevenueShare ? getRevenueShare(Number(log.fee?.toString() || 0) / 1e6, options) : 0
  })
  
  const filteredPairs = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances })
  
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

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

  const dailyHoldersRevenue = await fetchHoldersRevenue(options)
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: 0, dailyHoldersRevenue }
}

function getRevenueShare(fee: number, options: FetchOptions): number {
  if (!FEE_SWITCH_DATE[options.chain] || options.dateString < FEE_SWITCH_DATE[options.chain]) return 0;
  if (fee === 0.0001) return 0.000025;
  if (fee === 0.0005) return 0.000125;
  if (fee === 0.003) return 0.0005;
  if (fee === 0.01) return 0.001666;
  return 0;
}

(adapter.adapter as BaseAdapter)[CHAIN.ETHEREUM] = {
  fetch: async (options: FetchOptions) => {
    return await customUniswapGetLogsAdapter({
      options,
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      fromBlock: 12369621,
      getRevenueShare,
    })
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.BSC] = {
  fetch: async (options: FetchOptions) => {
    return await customUniswapGetLogsAdapter({
      options,
      factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
      fromBlock: 26324014,
      onlyWhitelisedTokens: true,
      getRevenueShare
    })
  },
};

export const UNISWAP_V3_QUERY = async (options: FetchOptions) => {
  const tokens = await getDefaultDexTokensWhitelisted({ chain: options.chain });
  const cleanVolumeExpr = tokens.length === 0
    ? 'amount_usd'
    : `CASE 
              WHEN token_sold_address IN (${tokens.toString()})
              AND token_bought_address IN (${tokens.toString()})
              THEN amount_usd
              ELSE 0
          END`;
  return `
    SELECT
        project_contract_address AS pool
        , SUM(${cleanVolumeExpr}) AS clean_volume_usd
        , SUM(amount_usd) AS total_volume_usd 
    FROM dex.trades
    WHERE blockchain = '${options.chain}'
      AND project = 'uniswap'
      AND version = '3'
      AND block_time >= FROM_UNIXTIME(${options.fromTimestamp})
      AND block_time <= FROM_UNIXTIME(${options.toTimestamp})
    GROUP BY
      project_contract_address
  `;
}

async function fetchDune(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const poolsAndVolumes = await queryDune('3996608', {
    fullQuery: await UNISWAP_V3_QUERY(options),
  }, options);
  const poolFees = await options.api.multiCall({
    abi: 'uint256:fee',
    calls: poolsAndVolumes.map((item: any) => item.pool)
  })
  for (let i = 0; i < poolsAndVolumes.length; i++) {
    if (poolsAndVolumes[i].clean_volume_usd !== null && poolsAndVolumes[i].total_volume_usd !== null) {
      const fee = poolFees[i] ? Number(poolFees[i] / 1e6) : 0
      const revenueRatio = getRevenueShare(fee, options)
      // add clean volume, exclude blacklist token
      dailyVolume.addUSDValue(poolsAndVolumes[i].clean_volume_usd)
      dailyFees.addUSDValue(Number(poolsAndVolumes[i].total_volume_usd) * fee)
      dailyRevenue.addUSDValue(Number(poolsAndVolumes[i].total_volume_usd) * revenueRatio)
    }
  }

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)
  const dailyHoldersRevenue = await fetchHoldersRevenue(options)
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
  }
}

(adapter.adapter as BaseAdapter)[CHAIN.ARBITRUM] = {
  fetch: async (options: FetchOptions) => {
    return await fetchDune(options);
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.BASE] = {
  fetch: async (options: FetchOptions) => {
    return await fetchDune(options);
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.OPTIMISM] = {
  fetch: async (options: FetchOptions) => {
    return await fetchDune(options);
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.WC] = {
  fetch: async (options: FetchOptions) => {
    return await fetchDune(options);
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.ZORA] = {
  fetch: async (options: FetchOptions) => {
    return await fetchDune(options);
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.CELO] = {
  fetch: async (options: FetchOptions) => {
    return await fetchDune(options);
  },
};

(adapter.adapter as BaseAdapter)[CHAIN.XLAYER] = {
  fetch: async (options: FetchOptions) => {
    return await fetchDune(options);
  },
};

export default adapter;
