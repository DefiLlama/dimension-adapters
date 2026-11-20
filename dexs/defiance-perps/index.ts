// Defiance (https://defiance.so) leveraged markets on Robinhood Chain: a crypto-Twitter attention index,
// equity and exchange-referenced markets (NVDA, Anthropic) and AI compute, traded against the Defiance
// House, whose LP vault takes the other side. Each fill has one taker (the trader) and is counted once.
//
// Volume is the notional (collateral x leverage) of positions opened, plus the closed share of that notional when a
// trader closes early, either with an on-chain signed close or a resolver close whose reason is verified against
// the exact settlement log. Liquidations, scheduled settlements, voids and refunds are excluded.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFIANCE_START, DEFIANCE_USDG, getDefianceTrades } from "../../helpers/defiance";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const { opens, closes } = await getDefianceTrades(options)
  for (const open of opens)
    if (open.kind === 'leveraged') dailyVolume.add(DEFIANCE_USDG, open.notional)
  for (const close of closes)
    if (close.kind === 'leveraged') dailyVolume.add(DEFIANCE_USDG, close.notionalClosed)
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: DEFIANCE_START,
  methodology: {
    Volume: 'Notional value (collateral times leverage) of leveraged positions opened on Defiance, plus the share voluntarily closed by traders. Resolver closes require settlement reasons verified against the on-chain event. Prior partial closes are deducted, and each fill is counted once. Liquidations, scheduled settlements, voids, refunds and fixed-odds bets are excluded.',
  },
}

export default adapter
