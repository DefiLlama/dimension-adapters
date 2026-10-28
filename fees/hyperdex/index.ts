import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DefaultDexTokensBlacklisted } from "../../helpers/lists";

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
// Addresses: https://github.com/lifinance/contracts/tree/main/deployments (FeeForwarder, LiFiDiamond),
// plus the shared routers listed in fees/lifi (0xce40... emits on Base and Arbitrum for these transfers).

const FeesForwardedEvent = "event FeesForwarded(address indexed token, (address recipient, uint256 amount)[] fees)"
const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)"

const INTEGRATOR = 'hyperdex'
const IntegratorFee = 'Integrator fee'

// HyperDex's integrator payout addresses: the recipient on every HyperDex FeesForwarded leg that is not
// LI.FI's. The first received every payout up to 2026-09-24; HyperDex then moved the payout to the
// second, so both are counted and the history stays whole.
const HYPERDEX_FEE_RECIPIENTS = [
  '0x1714433a95761117068ebc83d91b643b6c144c50',
  '0xf3619a5029bc4d7de640d22640cab564aeb34735',
]

const chainConfig: Record<string, { diamond: string; forwarders: string[]; start: string }> = {
  [CHAIN.ROBINHOOD]: {
    diamond: '0xB477751B76CF82d00a686A1232f5fCD772414Af3',
    forwarders: ['0xF4BFFE4dfC693f37715A47c15BdA8af9ed8f7Cf1', '0x4e0eb4c17A2Fc64f06314aFa4d3646241784ab3a'],
    start: '2026-09-16',
  },
  [CHAIN.BASE]: {
    diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    forwarders: ['0xce40449b773a3e6e5e769adb4e567179d4828cbd', '0xc18d9e84b8687a2645447a61e52c455dac1675e1'],
    start: '2026-09-16',
  },
  [CHAIN.ARBITRUM]: {
    diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    forwarders: ['0xce40449b773a3e6e5e769adb4e567179d4828cbd', '0xc18d9e84b8687a2645447a61e52c455dac1675e1'],
    start: '2026-09-16',
  },
  [CHAIN.ETHEREUM]: {
    diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    forwarders: ['0xce40449b773a3e6e5e769adb4e567179d4828cbd', '0x685527c551cc40ce1f1c9818cd8683307076e4ed'],
    start: '2026-09-16',
  },
  [CHAIN.ARC]: {
    diamond: '0xA4072583658Fae592A3506A42431cb6316a8d40b',
    forwarders: ['0xEDff4051B8286d2333149429F019dC10E23570da'],
    start: '2026-09-16',
  },
}

const fetch = async (options: FetchOptions) => {
  const { diamond, forwarders } = chainConfig[options.chain]
  const dailyFees = options.createBalances()
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
    Fees: 'The 0.25% integrator fee HyperDex charges on every swap, bridge and basket order routed through LI.FI: the FeesForwarded leg paid to HyperDex in a transaction whose LI.FI event carries integrator "hyperdex".',
    Revenue: 'All of the integrator fee goes to HyperDex.',
    ProtocolRevenue: 'All of the integrator fee goes to HyperDex.',
  },
  breakdownMethodology: {
    Fees: {
      [IntegratorFee]: 'The 0.25% integrator fee paid to HyperDex on each LI.FI-routed order.',
    },
    Revenue: {
      [IntegratorFee]: 'The 0.25% integrator fee paid to HyperDex on each LI.FI-routed order.',
    },
    ProtocolRevenue: {
      [IntegratorFee]: 'The 0.25% integrator fee paid to HyperDex on each LI.FI-routed order.',
    },
  },
}

export default adapter
