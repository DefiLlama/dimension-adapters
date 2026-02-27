import { SimpleAdapter, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const config = {
  ethereum: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  polygon: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  bsc: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  optimism: { exchange: '0xdef1abe32c034e558cdd535791643c58a13acc10' },
  fantom: { exchange: '0xdef189deaef76e379df891899eb5a00a94cbc250' },
  celo: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  [CHAIN.AVAX]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  arbitrum: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  base: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
} as { [chain: string]: { exchange: string } }

const fetchOTC: FetchV2 = async ({ getLogs, chain, createBalances }) => {
  const dailyVolume = createBalances()
  const logs = await getLogs({ target: config[chain].exchange, eventAbi: "event OtcOrderFilled(bytes32 orderHash, address maker, address taker, address makerToken, address takerToken, uint128 makerTokenFilledAmount, uint128 takerTokenFilledAmount)" })
  logs.forEach(log => dailyVolume.add(log.makerToken, log.makerTokenFilledAmount))
  return { dailyVolume }
}

const adapters: any = {}
Object.keys(config).forEach(chain => {
  adapters[chain] = { fetch: fetchOTC }
})

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: adapters,
}

export default adapter;
