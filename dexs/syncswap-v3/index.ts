import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

// const v3Endpoints = {
//   [CHAIN.ERA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-zksync-v3',
//   [CHAIN.LINEA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-linea-v3',
//   [CHAIN.SOPHON]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-sophon-v3',
// };


// const v3Graphs = getChainVolume2({
//   graphUrls: v3Endpoints,
//   totalVolume: {
//     factory: "factories",
//     field: DEFAULT_TOTAL_VOLUME_FIELD,
//   },
//   dailyVolume: {
//     factory: "uniswapDayData",
//     field: 'volumeUSD',
//   }
// });

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

const factories: {[key: string]: string} = {
  [CHAIN.ERA]: '0x9d63d318143cf14ff05f8aaa7491904a494e6f13',
  [CHAIN.LINEA]: '0xc5916f6cf441c72daa2e2c48afc7ce642eee6690',
  [CHAIN.SOPHON]: '0x0f6e27007e257e74c86522387bd071d561ba3c97',
}

const feeConfigs = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
  isAlgebraV3: true,
  poolCreatedEvent: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)',
}

async function fetch(options: FetchOptions) {
  const adapter = getUniV3LogAdapter({ factory: factories[options.chain], ...feeConfigs })
  const response = await adapter(options)
  return response;
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetch,
      start: '2023-03-23',
      meta,
    },
    [CHAIN.LINEA]: {
      fetch: fetch,
      start: '2023-07-19',
      meta,
    },
    [CHAIN.SOPHON]: {
      fetch: fetch,
      start: '2024-12-16',
      meta,
    }
  },
};

export default adapter;
