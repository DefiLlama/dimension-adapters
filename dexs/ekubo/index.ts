import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { httpGet } from "../../utils/fetchURL";
import * as sdk from "@defillama/sdk";

const toki = (n: any) => "starknet:0x" + BigInt(n).toString(16).padStart("049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7".length, "0")

const fetch = async (timestamp: number) => {
  const balances = new sdk.Balances({ chain: CHAIN.STARKNET, timestamp })
  const response = ((await fetchURL("https://mainnet-api.ekubo.org/overview")).volumeByToken_24h as any[])
    .map(t => ({ token: toki(t.token), vol: t.volume }))
  response.map((token) => {
    balances.add(token.token, token.vol, { skipChain: true })
  })
  return {
    timestamp: timestamp,
    dailyVolume: await balances.getUSDString(),
  };
}

// using this endpoint to find token id on Ekubo, ex find usdc id
// https://eth-mainnet-api.ekubo.org/pair/0x0000000000000000000000000000000000000000/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
const tokenMap: any = {
  '0': '0x0000000000000000000000000000000000000000', // ETH
  '1248875146012964071876423320777688075155124985543': '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  '917551056842671309452305380979543736893630245704': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '196268403159008932410419402999721616371951519129': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
  '1163022888421719912899836930504565803122825180095': '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', // cbBTC
  '180374059643543449999388718682590567161426737540': '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', // UNI
  '726330175714135941764069406682033110407748398240': '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', // wstETH
  '1153662193824988676821566247033479441673014749030': '0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766', // STRK
  '27216536086213442605709217948734064533345238287': '0x04C46E830Bb56ce22735d5d8Fc9CB90309317d0f', // EKUBO
  '437426098194082895061803372304124391670360729779': '0x4c9edd5852cd905f086c759e8383e09bff1e68b3', // USDe
  '897597142630517585618193047220246874462730466455': '0x9d39a5de30e57443bff2a8307a4256c8797a3497', // sUSDe
  '1244489736131057077877208263223884450381674766459': '0xd9fcd98c322942075a5c3860693e9f4f03aae07b', // EUL
  '572347342219638448467305352643680561532887805981': '0x6440f144b7e50d6a8439336510312d2f54beb01d', // BOLD
}

const fetchEVM = async (timestamp: number, _t: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const response: any[] = (await httpGet('https://eth-mainnet-api.ekubo.org/overview/volume')).volumeByTokenByDate
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  response.filter((t) => t.date.split('T')[0] === dateStr).map((t) => {
    if (!tokenMap[t.token]) return;
    dailyVolume.add(tokenMap[t.token], t.volume)
  })

  return {
    timestamp: timestamp,
    dailyVolume: dailyVolume,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-09-19'
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchEVM,
      start: '2025-01-31'
    }
  }
}

export default adapter;
