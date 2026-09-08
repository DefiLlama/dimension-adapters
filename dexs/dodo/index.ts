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
// api.dodoex.io needs an API key and the one this adapter carried now comes back
// 403 "request deny" (a bogus key gets 401 "Invalid API key", so it is recognised
// and refused, not mistyped). gateway.dodoex.io serves the same
// FetchDashboardDailyData query with no key and is the host fees/dodo-fees.ts
// already uses.
const dailyEndpoint = "https://gateway.dodoex.io/graphql?opname=FetchDashboardDailyData"
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
  const list = dailyResponse.data.dashboard_chain_day_data.list
  const day = list.find((item: any) => item.timestamp === options.startOfDay)

  if (!day)
    throw new Error(`dodo: dashboard_chain_day_data has no ${chain} row for ${options.dateString}`)

  const dailyVolume = Number(day.volume[chain])

  if (!Number.isFinite(dailyVolume))
    throw new Error(`dodo: ${chain} is missing from the volume object for ${options.dateString}`)

  if (dailyVolume === 0) {
    const trailing = list
      .filter((item: any) => item.timestamp < options.startOfDay && item.timestamp >= options.startOfDay - 7 * 24 * 60 * 60)
      .map((item: any) => Number(item.volume[chain]))
      .filter((value: number) => Number.isFinite(value))
      .sort((a: number, b: number) => a - b)
    const median = trailing.length ? trailing[Math.floor(trailing.length / 2)] : 0
    if (median > 10000)
      throw new Error(`dodo: ${chain} reports 0 volume for ${options.dateString} against a 7 day median of ${Math.round(median)}, refusing to publish a day the dashboard has not finished aggregating`)
  }

  return { dailyVolume }
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
