import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
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

const adapter: Adapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1695081600
    },
  }
}

export default adapter;
