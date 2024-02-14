import { Adapter, ChainBlocks, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const toki = (n: any) => "starknet:0x" + BigInt(n).toString(16).padStart("049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7".length, "0")

function getDimension(responseRaw: any[], key: string, balances: any) {
  const response = responseRaw
    .map(t => ({ token: toki(t.token), vol: t[key] }))
  response.map((token) => {
    balances.addTokenVannila(token.token, token.vol)
  })
  return balances
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions) => {
  const dailyFees = getDimension((await fetchURL("https://mainnet-api.ekubo.org/overview")).volumeByToken_24h, "fees", createBalances())
  const dailyRevenue = getDimension((await fetchURL("https://mainnet-api.ekubo.org/overview")).revenueByToken_24h, "revenue", createBalances())
  return {
    dailyFees,
    dailyRevenue,
    timestamp,
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1695168000
    },
  }
}

export default adapter;
