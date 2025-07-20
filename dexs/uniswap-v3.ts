import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { BaseAdapter, Chain, FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";
import { getUniV3LogAdapter } from "../helpers/uniswap";

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

interface IOkuResponse {
  volume: number;
  fees: number;
}
const fetchFromOku = async (options: FetchOptions) => {
  try {
    const url = `https://omni.icarus.tools/${mappingChain(options.chain === 'era' ? 'zksync' : options.chain)}/cush/analyticsProtocolHistoric`;
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
    console.error(e)
    return {}
  }
}
const mappingChain = (chain: string) => {
  if (chain === CHAIN.ERA) return "zksync"
  if (chain === CHAIN.ROOTSTOCK) return "rootstock"
  if (chain === CHAIN.POLYGON_ZKEVM) return "polygon-zkevm"
  if (chain === CHAIN.XDAI) return "gnosis"
  if (chain === CHAIN.LIGHTLINK_PHOENIX) return "lightlink"
  return chain
}

const meta = {
  methodology: {
    Fees: "Swap fees from paid by users.",
    UserFees: "User pays fees on each swap.",
    Revenue: "Protocol have no revenue.",
    ProtocolRevenue: "Protocol have no revenue.",
    SupplySideRevenue: "All user fees are distributed among LPs.",
    HoldersRevenue: "Holders have no revenue."
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: Object.keys(v3Endpoints).reduce((acc, chain) => {
    acc[chain] = {
      fetch: async (_t:any, _tb: any , options: FetchOptions) => v3Graphs(chain as Chain)(options),
      start: startTimeV3[chain],
      meta,
    }
    return acc
  }, {} as BaseAdapter)
}

adapter.adapter[CHAIN.AVAX] = {
  fetch: async (_t:any, _tb: any , options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD", userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 })
    const response = await adapter(options)
    return response;
  },
  meta,
}

adapter.adapter[CHAIN.WC] = {
  fetch: async (_t:any, _tb: any , options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x7a5028BDa40e7B173C278C5342087826455ea25a", userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 })
    const response = await adapter(options)
    return response;
  },
  meta,
}

const okuChains = [
  CHAIN.ETHEREUM,
  CHAIN.OPTIMISM,
  CHAIN.POLYGON,
  CHAIN.ERA,
  CHAIN.SEI,
  CHAIN.UNICHAIN,
  CHAIN.SEI,
  CHAIN.TAIKO,
  CHAIN.SCROLL,
  CHAIN.ROOTSTOCK,
  CHAIN.FILECOIN,
  CHAIN.BOBA,
  CHAIN.MOONBEAM,
  CHAIN.MANTA,
  CHAIN.MANTLE,
  CHAIN.LINEA,
  CHAIN.POLYGON_ZKEVM,
  CHAIN.BLAST,
  CHAIN.XDAI,
  CHAIN.BOB,
  CHAIN.LISK,
  CHAIN.CORN,
  CHAIN.GOAT,
  CHAIN.BSC,
  CHAIN.HEMI,
  // CHAIN.SAGA,
  CHAIN.XDC,
  CHAIN.LIGHTLINK_PHOENIX,
  // CHAIN.ARBITRUM,
  CHAIN.LENS,
  CHAIN.TELOS,
  CHAIN.CELO,
]



okuChains.forEach(chain => {
  adapter.adapter[chain] = {
    fetch: async (_t:any, _tb: any , options: FetchOptions) => fetchFromOku(options),
    meta,
  }
})

export default adapter;
