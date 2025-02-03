import { Adapter, ChainBlocks, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL, { httpGet } from "../utils/fetchURL";

const toki = (n: any) => "starknet:0x" + BigInt(n).toString(16).padStart("049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7".length, "0")

function getDimension(responseRaw: any[], key: string, balances: any) {
  const response = responseRaw
    .map(t => ({ token: toki(t.token), vol: t[key] }))
  response.map((token) => {
    balances.addTokenVannila(token.token, token.vol)
  })
  return balances
}

const fetch = async ({ createBalances }: FetchOptions) => {
  const dailyFees = getDimension((await fetchURL("https://mainnet-api.ekubo.org/overview")).volumeByToken_24h, "fees", createBalances())
  const dailyRevenue = getDimension((await fetchURL("https://mainnet-api.ekubo.org/overview")).revenueByToken_24h, "revenue", createBalances())
  return {
    dailyFees,
    dailyRevenue,
  }
}

const tokenMap: any = {
  '1248875146012964071876423320777688075155124985543': '0xdac17f958d2ee523a2206206994597c13d831ec7',
  '917551056842671309452305380979543736893630245704': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  '262709962604544': '0x0000000000000000000000000000000000000000',
  '1163022888421719912899836930504565803122825180095': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
}

const fetchEVM = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const response: any[] = (await httpGet('https://eth-mainnet-api.ekubo.org/overview/volume')).volumeByTokenByDate
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  response.filter((t) => t.date.split('T')[0] === dateStr).map((t) => {
    if (!tokenMap[t.token]) return;
    dailyFees.add(tokenMap[t.token], t.fees)
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-09-20'
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchEVM,
      start: '2025-01-31'
    }
  }
}

export default adapter;
