import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";
import dailyVolumePayload from "./dailyVolumePayload";
import { addOneToken } from "../../helpers/prices";

/* const endpoints = {
  [CHAIN.ARBITRUM]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.AURORA]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.BSC]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.ETHEREUM]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.POLYGON]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  // [MOONRIVER]: sdk.graph.modifyEndpoint('G4HFPFJue7zf2BktJuKETh72DscimLJRybVA6iD6A7yM'),
  // [AVAX]: sdk.graph.modifyEndpoint('8GUXi8PNrW4ACf968KCWxH9AkeNt8YEQin7MDa7RuULW'),
  // [BOBA]: sdk.graph.modifyEndpoint('6PVfSucTfTimvx3aMgWsatmRDBNxW7yQKayyZ7Mxrf73')
  // [HECO]: "https://n10.hg.network/subgraphs/name/dodoex-mine-v3-heco/heco",
  // [OKEXCHAIN]: "https://graph.kkt.one/subgraphs/name/dodoex/dodoex-v2-okchain",
} as ChainEndpoints */
const dailyEndpoint = "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData&apikey=graphqldefiLlamadodoYzj5giof"
const chains = [
  CHAIN.ARBITRUM,
  CHAIN.BSC,
  CHAIN.ETHEREUM,
  CHAIN.POLYGON,
  CHAIN.AVAX,
  CHAIN.OPTIMISM,
  CHAIN.BASE,
  CHAIN.LINEA,
  CHAIN.SCROLL,
  //  CHAIN.MANTA
  // CHAIN.DFIO_META_MAIN,
]

interface IDailyResponse {
  data: {
    dashboard_chain_day_data: {
      list: Array<{
        timestamp: number,
        volume: {
          [chain: string]: string
        }
      }>
    }
  }
}

// const dfioFetch = async (options: FetchOptions) => {

//   const dvmFactory = '0xc93870594C7f83A0aE076c2e30b494Efc526b68E';

//   const poolCreatedLogs = await options.getLogs({
//     target: dvmFactory,
//     eventAbi: "event NewDVM (address baseToken, address quoteToken, address creator, address dvm)",
//     fromBlock: 3510162,
//     cacheInCloud: true,
//   });

//   const pools = poolCreatedLogs.map((log) => log.dvm);

//   const SWAP_ABI =
//     "event DODOSwap(address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address trader, address receiver)";

//   const dailyVolume = options.createBalances();

//   const swapLogs = await options.getLogs({
//     targets: pools,
//     eventAbi: SWAP_ABI,
//   });

//   for (const log of swapLogs) {
//     addOneToken({ chain: options.chain, balances: dailyVolume, token0: log.fromToken, amount0: log.fromAmount, token1: log.toToken, amount1: log.toAmount });
//   }

//   return {
//     dailyVolume,
//   };
// }

const fetch = async (options: FetchOptions) => {
  const chain = chainConversion(options.chain)
  const dailyResponse = (await postURL(dailyEndpoint, dailyVolumePayload(chain))) as IDailyResponse

  return {
    dailyVolume: dailyResponse.data.dashboard_chain_day_data.list.find((item: any) => item.timestamp === options.startOfDay)?.volume[chain],
  }
}

const chainConversion = (chain: string): string => {
  switch (chain) {
    case CHAIN.SCROLL:
      return 'scr';
    case CHAIN.MANTA:
      return 'manta';
    case CHAIN.AVAX:
      return 'avalanche';
    default:
      return chain;
  }
}

const volume = chains.reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch,
    },
  }),
  {}
);


const adapter: SimpleAdapter = {
  adapter: volume
};


export default adapter
