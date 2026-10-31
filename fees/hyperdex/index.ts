import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchTransfersFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { DefaultDexTokensBlacklisted } from "../../helpers/lists";
import { httpGet } from "../../utils/fetchURL";

// HyperDex (https://hyperdex.app) - swap and bridge aggregator for tokenized stocks and other RWAs,
// routed through LI.FI under the integrator string "hyperdex" with a 0.25% integrator fee on every
// swap, bridge and basket order.
//
// LI.FI's router pays the fee out inside the order's own transaction and emits FeesForwarded with the
// full recipient split (see fees/lifi): one leg to LI.FI's own address, one leg to the integrator's
// registered payout address. FeesForwarded itself names no integrator and the forwarder is callable
// by anyone, so a leg is counted only when the same transaction also carries a LI.FI diamond event
// (LiFiGenericSwapCompleted for a same-chain swap, LiFiTransferStarted for a bridge) whose integrator
// is "hyperdex", and the leg's recipient is one of HyperDex's payout addresses. LI.FI's leg is LI.FI's
// revenue and is counted by the lifi adapter, not here.
//
// Verified 2026-09-24 on 21 HyperDex transfers (Robinhood 11, Arbitrum 5, Base 3, Arc 2) read from
// the LI.FI analytics API for integrator=hyperdex: every payout above LI.FI's minimum names the same
// recipient on every chain, at 50/50 with LI.FI's leg, in the same transaction as the diamond event.
//
// Robinhood Chain and Solana are read from LI.FI's analytics API instead: Solana's program emits no EVM
// event, and most Robinhood Chain tokens HyperDex trades have no DefiLlama price, so an on-chain leg there
// counts $0. The API gives each transfer's fee in USD and its split; HyperDex's share is the integrator part.
//
// Fynd (Robinhood Chain): HyperDex's 15 bp client fee on Fynd swaps is paid inside Fynd's TychoRouter, whose
// FeesTaken event lists each leg; the leg to HyperDex's fee receiver is HyperDex's (Fynd keeps the other).
//
// RAVN, Velora, Hinkal and CoW: HyperDex's other route sources leave nothing on-chain that names HyperDex, so their
// fee is HyperDex's fee rate on each completed swap in HyperDex's own swap record (the list
// https://hyperdex.app/explorer shows), at the swap's dollar amount when sent, on the sending chain:
// https://hyperdex.app/api/defillama. Rates: RAVN 50 bp until 2026-10-16, 5 bp after (none before 2026-10-19 on
// routes with no fee of their own: Eco, Layerswap, Mayan, Jupiter; Rift 0.25 % from 2026-10-14); Velora 5 bp
// (Delta) or 10 bp (Market); Hinkal 10 bp; CoW 15 bp.
//
// Addresses: https://github.com/lifinance/contracts/tree/main/deployments (FeeForwarder, LiFiDiamond),
// plus the shared routers listed in fees/lifi (0xce40... emits on Base and Arbitrum for these transfers).

const FeesForwardedEvent = "event FeesForwarded(address indexed token, (address recipient, uint256 amount)[] fees)"
const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const FyndFeesTakenEvent = "event FeesTaken(address indexed token, (address recipient, uint256 amount)[] fees)"
const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)"

const INTEGRATOR = 'hyperdex'
const IntegratorFee = 'Integrator fee'
const FyndFee = 'Fynd client fee'
const HYPERDEX_API = 'https://hyperdex.app/api/defillama'
// the record's sources and their fee labels
const RecordFees: Record<string, string> = { ravn: 'RAVN integrator fee', velora: 'Velora partner fee', private: 'Hinkal partner fee', cow: 'CoW partner fee' }

// HyperDex's integrator payout addresses: the recipient on every HyperDex FeesForwarded leg that is not
// LI.FI's. The first received every payout up to 2026-09-24; HyperDex then moved the payout to the
// second, so both are counted and the history stays whole.
const HYPERDEX_FEE_RECIPIENTS = [
  '0x1714433a95761117068ebc83d91b643b6c144c50',
  '0xf3619a5029bc4d7de640d22640cab564aeb34735',
]

// chainId: the chain's id in HyperDex's record
const chainConfig: Record<string, { chainId: number; diamond?: string; forwarders?: string[]; lifiChainId?: number; fyndRouter?: string; start: string }> = {
  // API-routed (see above), plus Fynd's router
  [CHAIN.ROBINHOOD]: { chainId: 4663, lifiChainId: 4663, fyndRouter: '0x09215a470bd585e59eb3f4b612fbd2678131ff9e', start: '2026-09-16' },
  [CHAIN.SOLANA]: { chainId: 1151111081099710, lifiChainId: 1151111081099710, start: '2026-09-16' },
  [CHAIN.BASE]: {
    chainId: 8453,
    diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    forwarders: ['0xce40449b773a3e6e5e769adb4e567179d4828cbd', '0xc18d9e84b8687a2645447a61e52c455dac1675e1'],
    start: '2026-09-16',
  },
  [CHAIN.ARBITRUM]: {
    chainId: 42161,
    diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    forwarders: ['0xce40449b773a3e6e5e769adb4e567179d4828cbd', '0xc18d9e84b8687a2645447a61e52c455dac1675e1'],
    start: '2026-09-16',
  },
  [CHAIN.ETHEREUM]: {
    chainId: 1,
    diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    forwarders: ['0xce40449b773a3e6e5e769adb4e567179d4828cbd', '0x685527c551cc40ce1f1c9818cd8683307076e4ed'],
    start: '2026-09-16',
  },
  [CHAIN.BSC]: {
    chainId: 56,
    diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    forwarders: ['0xce40449b773a3e6e5e769adb4e567179d4828cbd', '0xc18d9e84b8687a2645447a61e52c455dac1675e1'],
    start: '2026-09-16',
  },
  [CHAIN.ARC]: {
    chainId: 5042,
    diamond: '0xA4072583658Fae592A3506A42431cb6316a8d40b',
    forwarders: ['0xEDff4051B8286d2333149429F019dC10E23570da'],
    start: '2026-09-16',
  },
  // HyperDex's record only (no LI.FI orders from here)
  [CHAIN.POLYGON]: { chainId: 137, start: '2026-10-11' },
  [CHAIN.AVAX]: { chainId: 43114, start: '2026-10-11' },
  [CHAIN.ERA]: { chainId: 324, start: '2026-10-11' },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: '2026-10-11' },
}

const fetch = async (options: FetchOptions) => {
  const { chainId, diamond, forwarders, lifiChainId, fyndRouter } = chainConfig[options.chain]
  const dailyFees = options.createBalances()

  // RAVN, Velora, Hinkal and CoW fees from HyperDex's record, in USD
  const record = await httpGet(`${HYPERDEX_API}?start=${options.startTimestamp}&end=${options.endTimestamp}`)
  Object.entries(record.fees?.[chainId] ?? {}).forEach(([source, usd]: [string, any]) => {
    if (RecordFees[source]) dailyFees.addUSDValue(Number(usd) || 0, RecordFees[source])
  })

  if (lifiChainId) {
    // every hyperdex transfer in the window, all chains (the helper has no numeric LI.FI chainId for Robinhood), kept to this chain
    const transfers = await fetchTransfersFromLIFIAPI(options.startTimestamp, options.endTimestamp, [INTEGRATOR])
    transfers.forEach((tx: any) => {
      if (tx.sending.chainId !== lifiChainId) return
      ;(tx.feeCosts ?? []).forEach((fee: any) => {
        const amount = Number(fee.amount), integratorFee = Number(fee.feeSplit?.integratorFee ?? 0), usd = Number(fee.amountUSD)
        if (amount > 0 && integratorFee > 0 && usd > 0) dailyFees.addUSDValue((usd * integratorFee) / amount, IntegratorFee)
      })
    })
  }

  if (fyndRouter) {
    const feeLogs: any[] = await options.getLogs({ target: fyndRouter, eventAbi: FyndFeesTakenEvent })
    feeLogs.forEach((log: any) => {
      log.fees.forEach((fee: any) => {
        if (HYPERDEX_FEE_RECIPIENTS.includes(String(fee.recipient).toLowerCase())) dailyFees.add(log.token, fee.amount, FyndFee)
      })
    })
  }

  if (!diamond || !forwarders) return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }

  const blacklistForChain = new Set((DefaultDexTokensBlacklisted[options.chain] ?? []).map((a) => a.toLowerCase()))

  // the transactions of this window that LI.FI executed for HyperDex
  const swaps: any[] = await options.getLogs({ target: diamond, eventAbi: LifiSwapEvent, entireLog: true })
  const bridges: any[] = await options.getLogs({ target: diamond, eventAbi: LifiBridgeEvent, entireLog: true })
  const hyperdexTxs = new Set<string>()
  swaps.forEach((log: any) => {
    if (log.args.integrator === INTEGRATOR) hyperdexTxs.add(String(log.transactionHash).toLowerCase())
  })
  bridges.forEach((log: any) => {
    if (log.args.bridgeData.integrator === INTEGRATOR) hyperdexTxs.add(String(log.transactionHash).toLowerCase())
  })

  const forwarded: any[] = await options.getLogs({
    targets: forwarders.map((a) => a.toLowerCase()),
    eventAbi: FeesForwardedEvent,
    entireLog: true,
  })
  forwarded.forEach((log: any) => {
    if (!hyperdexTxs.has(String(log.transactionHash).toLowerCase())) return
    const token = String(log.args.token)
    if (blacklistForChain.has(token.toLowerCase())) return
    log.args.fees.forEach((fee: any) => {
      if (HYPERDEX_FEE_RECIPIENTS.includes(String(fee.recipient).toLowerCase())) dailyFees.add(token, fee.amount, IntegratorFee)
    })
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: 'The 0.25% integrator fee HyperDex charges on every swap, bridge and basket order routed through LI.FI: the FeesForwarded leg paid to HyperDex in a transaction whose LI.FI event carries integrator "hyperdex" (Robinhood Chain and Solana: the integrator share of each transfer\'s fee from LI.FI\'s analytics API, in USD); HyperDex\'s leg of its client fee on Fynd swaps, from the TychoRouter FeesTaken event; and HyperDex\'s fee on RAVN, Velora, Hinkal and CoW swaps, at its fee rate on each completed swap in HyperDex\'s own swap record (https://hyperdex.app/api/defillama), at the swap\'s dollar amount when sent.',
    Revenue: 'All of these fees go to HyperDex.',
    ProtocolRevenue: 'All of these fees go to HyperDex.',
  },
  breakdownMethodology: {
    Fees: {
      [IntegratorFee]: 'The 0.25% integrator fee paid to HyperDex on each LI.FI-routed order.',
      [FyndFee]: 'HyperDex\'s part of its 15 bp client fee on each Fynd swap (Fynd keeps the rest).',
      [RecordFees.ravn]: 'HyperDex\'s fee on RAVN-routed swaps: 50 bp until 2026-10-16, 5 bp after.',
      [RecordFees.velora]: 'HyperDex\'s partner fee on Velora swaps: 5 bp on Delta orders, 10 bp on Market swaps.',
      [RecordFees.private]: 'HyperDex\'s 10 bp partner fee on Hinkal private swaps.',
      [RecordFees.cow]: 'HyperDex\'s 15 bp partner fee on CoW Swap orders.',
    },
    Revenue: {
      [IntegratorFee]: 'The 0.25% integrator fee paid to HyperDex on each LI.FI-routed order.',
      [FyndFee]: 'HyperDex\'s part of its 15 bp client fee on each Fynd swap (Fynd keeps the rest).',
      [RecordFees.ravn]: 'HyperDex\'s fee on RAVN-routed swaps: 50 bp until 2026-10-16, 5 bp after.',
      [RecordFees.velora]: 'HyperDex\'s partner fee on Velora swaps: 5 bp on Delta orders, 10 bp on Market swaps.',
      [RecordFees.private]: 'HyperDex\'s 10 bp partner fee on Hinkal private swaps.',
      [RecordFees.cow]: 'HyperDex\'s 15 bp partner fee on CoW Swap orders.',
    },
    ProtocolRevenue: {
      [IntegratorFee]: 'The 0.25% integrator fee paid to HyperDex on each LI.FI-routed order.',
      [FyndFee]: 'HyperDex\'s part of its 15 bp client fee on each Fynd swap (Fynd keeps the rest).',
      [RecordFees.ravn]: 'HyperDex\'s fee on RAVN-routed swaps: 50 bp until 2026-10-16, 5 bp after.',
      [RecordFees.velora]: 'HyperDex\'s partner fee on Velora swaps: 5 bp on Delta orders, 10 bp on Market swaps.',
      [RecordFees.private]: 'HyperDex\'s 10 bp partner fee on Hinkal private swaps.',
      [RecordFees.cow]: 'HyperDex\'s 15 bp partner fee on CoW Swap orders.',
    },
  },
}

export default adapter
