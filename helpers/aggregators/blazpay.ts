import { Interface } from "ethers";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../chains";
import { getTransactionsWithRetry } from "../getTxReceipts";

// Every Blazpay swap or bridge is sent by the user to BlazpayRelayer. The relayer pulls the input
// token (or takes the native value) and calls the chosen aggregator or bridge router. It emits
// MetaTransactionExecuted, which has no amount, so the amount is decoded from the tx input.
// Current addresses: https://docs.blazpay.com/reference/contracts
const RELAYER_V0 = '0x10c112a6032dc97ec8854457fa3961d29db2045a' // first deployment, all chains, Nov 2024 - Mar 2025
const RELAYER_A = '0x7d98E59FabFBaDD5eCB61CC2cf876AA97f505531'
const RELAYER_B = '0x5c23c9a42626Ade38ae1c9a3407096d4381EE6E6'
const RELAYER_C = '0xb8Bd470f3C2610F83025D049085A64f1C7b78F14'
const RELAYER_D = '0xA01da2d3AbEFFbaa347B08C76EEC47169DdE72e9'
const POLYGON_V0 = '0xdddd393a0cc91368b5e61b4714e72259f4e061ea' // Polygon, Nov 2024 - Mar 2025
const POLYGON_V1 = '0xa851d4125cc029743f371ead4f9dde4ba04f5146' // Polygon, Apr 2025 - May 2026

// start = first Blazpay swap on the chain
export const blazpayChainConfig: Record<string, { relayers: string[]; start: string }> = {
  [CHAIN.ETHEREUM]: { relayers: [RELAYER_A], start: '2025-02-20' },
  [CHAIN.OPTIMISM]: { relayers: [RELAYER_V0, RELAYER_C], start: '2025-01-10' },
  [CHAIN.BSC]: { relayers: [RELAYER_V0, RELAYER_B], start: '2024-11-29' },
  [CHAIN.POLYGON]: { relayers: [POLYGON_V0, RELAYER_V0, POLYGON_V1, RELAYER_A], start: '2024-11-27' },
  [CHAIN.BASE]: { relayers: [RELAYER_V0, RELAYER_C], start: '2024-12-04' },
  [CHAIN.ARBITRUM]: { relayers: [RELAYER_V0, RELAYER_B], start: '2024-12-04' },
  [CHAIN.AVAX]: { relayers: [RELAYER_V0, RELAYER_C], start: '2025-02-18' },
  [CHAIN.LINEA]: { relayers: [RELAYER_V0, RELAYER_B], start: '2025-01-10' },
  [CHAIN.SCROLL]: { relayers: [RELAYER_V0, RELAYER_B], start: '2025-02-26' },
  [CHAIN.BLAST]: { relayers: [RELAYER_V0, RELAYER_C], start: '2025-02-17' },
  [CHAIN.FANTOM]: { relayers: [RELAYER_V0, RELAYER_C], start: '2025-02-20' },
  [CHAIN.MANTLE]: { relayers: [RELAYER_V0, RELAYER_C], start: '2025-02-21' },
  [CHAIN.METIS]: { relayers: [RELAYER_V0], start: '2025-02-19' },
  [CHAIN.POLYGON_ZKEVM]: { relayers: [RELAYER_V0], start: '2025-02-26' },
  [CHAIN.UNICHAIN]: { relayers: [RELAYER_D], start: '2026-05-17' },
  [CHAIN.SONIC]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.OP_BNB]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.WC]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.HYPERLIQUID]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.SONEIUM]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.RONIN]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.ABSTRACT]: { relayers: [RELAYER_C], start: '2026-05-17' },
  [CHAIN.APECHAIN]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.CELO]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.HEMI]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.BERACHAIN]: { relayers: [RELAYER_A], start: '2026-05-17' },
  [CHAIN.ROBINHOOD]: { relayers: [RELAYER_C], start: '2026-07-25' },
  [CHAIN.ARC]: { relayers: [RELAYER_C], start: '2026-09-16' },
}

// v0 and v1+ take different structs. The selectors differ, so one interface decodes both.
const relayerInterface = new Interface([
  'function executeMetaTransactionSwap((address from, address targetContract, bytes data, uint256 amount, address token, bool isNative, address spender, uint256 nativeValue) _metaTx)',
  'function executeMetaTransactionSwap((address targetContract, bytes data, uint256 amount, address token, bool isNative, address recipient, uint256 nativeValue, uint256 nonce, uint256 deadline) _metaTx, bytes signature)',
])

// Selectors of the router call that start a cross-chain transfer. Any other call is a same-chain swap.
// Checked against Blazpay's own records of 162k relayer txs: no selector below was ever a same-chain swap.
const BRIDGE_SELECTORS = new Set([
  // LI.FI diamond startBridgeTokensVia* / swapAndStartBridgeTokensVia*
  '0x606326ff', '0x30c48952', '0xae328590', '0x28cc4316', '0x25d374e8', '0x14d53077', '0x3110c7b9', '0x28832cbd',
  '0xa6010a66', '0xfc5f1003', '0x1794958f', '0xa8f66666', '0xa3443faa', '0xb621b032', '0xb70fb9a5', '0x482c6a85', '0x34a3e4a0',
  '0xa11b1198', // Symbiosis metaRoute
  '0xf452ed4d', '0x8a2e12a5', '0x0421caf0', '0x67d70e13', '0x9d9c44c9', '0x06135b7c', // Router Nitro deposits
  '0x846a1bc6', // Squid callBridgeCall
  '0x6e1537da', // Butter swapAndBridge
  '0xad5425c6', '0x110560ad', '0x609ea081', // Across SpokePool deposits
  '0x49290c1c', // Relay depository
  '0xa44bbb15', // OpenOcean cross-chain
  '0xd5a314ab', // Unizen cross-chain
  '0xa9059cbb', // ERC20 transfer to a NEAR Intents (1Click) deposit address
  '0x', // native transfer to a NEAR Intents (1Click) deposit address
])

export type BlazpayKind = 'swap' | 'bridge'

export async function fetchBlazpayVolume(options: FetchOptions, kind: BlazpayKind) {
  const { relayers } = blazpayChainConfig[options.chain]
  const volume = options.createBalances()

  const logs = await options.getLogs({
    targets: relayers,
    eventAbi: 'event MetaTransactionExecuted(address indexed user, address targetContract, bytes data)',
    entireLog: true,
  })
  if (!logs.length) return volume

  const txHashes = [...new Set(logs.map((log: any) => log.transactionHash.toLowerCase()))]
  const txs = await getTransactionsWithRetry(options.chain, txHashes)
  // A missing tx would silently drop its volume, so fail the run and let it be retried
  const fetched = txs.filter((tx): tx is NonNullable<typeof tx> => tx !== null)
  if (fetched.length !== txHashes.length) throw new Error(`blazpay ${options.chain}: ${txHashes.length - fetched.length} of ${txHashes.length} relayer txs could not be fetched`)

  let undecoded = 0
  for (const tx of fetched) {
    const parsed = relayerInterface.parseTransaction({ data: tx.data, value: tx.value })
    if (!parsed) { undecoded++; continue }
    const metaTx = parsed.args._metaTx
    const isBridge = BRIDGE_SELECTORS.has((metaTx.data as string).slice(0, 10).toLowerCase())
    if (isBridge !== (kind === 'bridge')) continue
    if (metaTx.isNative) volume.addGasToken(metaTx.amount)
    else volume.add(metaTx.token, metaTx.amount)
  }
  // A relayer tx sent through another contract (e.g. a smart wallet) cannot be decoded from its input
  if (undecoded) console.log(`blazpay ${options.chain}: ${undecoded} of ${txHashes.length} relayer txs not decoded`)

  return volume
}
