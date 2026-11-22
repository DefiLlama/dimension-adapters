import { ChainApi } from "@defillama/sdk"
import ADDRESSES from "../helpers/coreAssets.json"
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

// Routers: v1.2 from https://docs.chain.link/api/ccip/v1/chains?environment=mainnet, v1.0 from the v1.0 OffRamp configs. OnRamps come from their OnRampSet logs.
// fromBlock: first OnRampSet block on the chain.
// testRouters: Chainlink's OnRamp 2.0 test Routers (owned by the 2.0 fee aggregator 0x062f05CD), not in the directory; their messages are not fees.
const chainConfig: Record<string, { start: string, fromBlock: number, routers: string[], testRouters: string[] }> = {
  [CHAIN.ETHEREUM]: { start: '2023-07-06', fromBlock: 17636648, routers: ['0xE561d5E02207fb5eB32cca20a699E0d8919a1476', '0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D'], testRouters: ['0x3237c0d7b58bec8dc17f00103b784bd6678f789e'] },
  [CHAIN.OPTIMISM]: { start: '2023-07-07', fromBlock: 106535112, routers: ['0x261c05167db67B2b619f9d312e0753f3721ad6E8', '0x3206695CaE29952f4b0c22a169725a865bc8Ce0f'], testRouters: ['0x72f6000d70b291c67bed898214156d01383274b1'] },
  [CHAIN.POLYGON]: { start: '2023-07-07', fromBlock: 44762067, routers: ['0x3C3D92629A02a8D95D5CB9650fe49C3544f69B43', '0x849c5ED5a80F5B408Dd4969b78c2C8fdf0565Bfe'], testRouters: ['0x770318d51052871def5eb5c452f4fd28b7960c4e'] },
  [CHAIN.AVAX]: { start: '2023-07-07', fromBlock: 32263105, routers: ['0x27F39D0af3303703750D4001fCc1844c6491563c', '0xF4c7E640EdA248ef95972845a62bdC74237805dB'], testRouters: ['0x1ba9be96a5c21dcdb9d22bec3f00abcb6336fd65'] },
  [CHAIN.BASE]: { start: '2023-09-16', fromBlock: 4056435, routers: ['0x673AA85efd75080031d44fcA061575d1dA427A28', '0x881e3A65B4d4a04dD529061dd0071cf975F58bCD'], testRouters: ['0x70003d849a20e33997fea69bbc8a366d6ab0e131'] },
  [CHAIN.ARBITRUM]: { start: '2023-09-17', fromBlock: 131743481, routers: ['0xE92634289A1841A979C11C2f618B33D376e4Ba85', '0x141fa059441E0ca23ce184B6A78bafD2A517DdE8'], testRouters: ['0x72f6000d70b291c67bed898214156d01383274b1'] },
  [CHAIN.BSC]: { start: '2023-09-17', fromBlock: 31804025, routers: ['0x536d7E53D0aDeB1F20E7c81fea45d02eC9dBD698', '0x34B03Cb9086d7D758AC55af71584F81A598759FE'], testRouters: ['0x006bc1f599a10b73c88cc3cd19a92829c4ac1e83'] },
  // first sends on 2025-08-28 paid in MON, which has no price before 2025-11-24
  [CHAIN.MONAD]: { start: '2025-11-24', fromBlock: 18844815, routers: ['0x33566fE5976AAa420F3d5C64996641Fc3858CaDB'], testRouters: ['0xc23071a8ae83671f37bda1dadbc745a9780f632a'] },
  [CHAIN.XLAYER]: { start: '2024-10-15', fromBlock: 5591552, routers: ['0xF2b6Cb7867EB5502C3249dD37D7bc1Cc148e5232'], testRouters: ['0x770318d51052871def5eb5c452f4fd28b7960c4e'] },
  [CHAIN.HYPERLIQUID]: { start: '2025-06-12', fromBlock: 2495727, routers: ['0x13b3332b66389B1467CA6eBd6fa79775CCeF65ec'], testRouters: ['0x7244a2743ea8d04a0a83624597fff0a8c7e98a44'] },
  [CHAIN.ROBINHOOD]: { start: '2026-05-27', fromBlock: 6412, routers: ['0x06fC836cf9839B1cd891C440A0a45242DA6Ae1c9'], testRouters: ['0xaef7a922931848d2e731d5914f428b4e851d1ad5'] },
}

// Fee tokens with price gaps, priced as the Ethereum token: bridged LINK (the OnRamp/FeeQuoter linkToken), L2 WETH,
// and Monad 0x3a70, a second Wrapped MON fully backed by MON.
const LINK = `ethereum:${ADDRESSES.ethereum.LINK}`
const WETH = `ethereum:${ADDRESSES.ethereum.WETH}`
const PRICE_AS: Record<string, Record<string, string>> = {
  [CHAIN.OPTIMISM]: { '0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6': LINK, [ADDRESSES.optimism.WETH_1]: WETH },
  [CHAIN.POLYGON]: { '0xb0897686c545045afc77cf20ec7a532e3120e0f1': LINK },
  [CHAIN.AVAX]: { '0x5947bb275c521040051d82396192181b413227a3': LINK },
  [CHAIN.BASE]: { '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196': LINK, [ADDRESSES.base.WETH]: WETH },
  [CHAIN.ARBITRUM]: { '0xf97f4df75117a78c1a5a0dbb814af92458539fb4': LINK, [ADDRESSES.arbitrum.WETH]: WETH },
  [CHAIN.BSC]: { '0x404460c6a5ede2d891e8297795264fde62adbb75': LINK },
  [CHAIN.MONAD]: { '0x76f257b1dda5cc71bee4ef637fbdde4c801310a9': LINK, '0x3a704ad3e4784b935ae029171adcf57ee7988198': `monad:${ADDRESSES.monad.WMON}` },
  [CHAIN.XLAYER]: { '0x8af9711b44695a5a081f25ab9903ddb73acf8fa9': LINK },
  [CHAIN.HYPERLIQUID]: { '0x1ac2ee68b8d038c982c1e1f73f596927dd70de59': LINK },
  [CHAIN.ROBINHOOD]: { '0x492641f648a4986844848e0befe66d14817bce34': LINK, [ADDRESSES.robinhood.WETH]: WETH },
}

const IPOOL_V2_INTERFACE_ID = '0x940a1542' // type(IPoolV2).interfaceId: true on 2.x pools, false on 1.5/1.6 pools

const ON_RAMP_SET = 'event OnRampSet(uint64 indexed destChainSelector, address onRamp)'
const SEND_EVENTS = {
  v1_0: 'event CCIPSendRequested((uint64 sourceChainSelector, uint64 sequenceNumber, uint256 feeTokenAmount, address sender, uint64 nonce, uint256 gasLimit, bool strict, address receiver, bytes data, (address token, uint256 amount)[] tokenAmounts, address feeToken, bytes32 messageId) message)',
  v1_2: 'event CCIPSendRequested((uint64 sourceChainSelector, address sender, address receiver, uint64 sequenceNumber, uint256 gasLimit, bool strict, uint64 nonce, address feeToken, uint256 feeTokenAmount, bytes data, (address token, uint256 amount)[] tokenAmounts, bytes[] sourceTokenData, bytes32 messageId) message)',
  v1_6: 'event CCIPMessageSent(uint64 indexed destChainSelector, uint64 indexed sequenceNumber, ((bytes32 messageId, uint64 sourceChainSelector, uint64 destChainSelector, uint64 sequenceNumber, uint64 nonce) header, address sender, bytes data, bytes receiver, bytes extraArgs, address feeToken, uint256 feeTokenAmount, uint256 feeValueJuels, (address sourcePoolAddress, bytes destTokenAddress, bytes extraData, uint256 amount, bytes destExecData)[] tokenAmounts) message)',
  v2_0: 'event CCIPMessageSent(uint64 indexed destChainSelector, address indexed sender, bytes32 indexed messageId, address feeToken, uint256 tokenAmountBeforeTokenPoolFees, bytes encodedMessage, (address issuer, uint32 destGasLimit, uint32 destBytesOverhead, uint256 feeTokenAmount, bytes extraArgs)[] receipts, bytes[] verifierBlobs)',
}
type Family = keyof typeof SEND_EVENTS
const FAMILIES = Object.keys(SEND_EVENTS) as Family[]

const FAMILY_BY_VERSION: Record<string, Family> = {
  'EVM2EVMOnRamp 1.0.0': 'v1_0',
  'EVM2EVMOnRamp 1.2.0': 'v1_2',
  'EVM2EVMOnRamp 1.5.0': 'v1_2',
  'OnRamp 1.6.0': 'v1_6',
  'OnRamp 2.0.0': 'v2_0',
}

const LABELS = {
  messagingFees: 'CCIP Messaging Fees',
  networkFees: 'CCIP Network Fees',
  executionFees: 'CCIP Execution Fees',
  verifierFees: 'CCIP Verifier Fees',
  tokenTransferFees: 'CCIP Token Transfer Fees',
  messagingToNodeOperators: 'Messaging Fees To Node Operators',
  messagingToChainlink: 'Messaging Fees To Chainlink',
  networkToChainlink: 'Network Fees To Chainlink',
  executionToExecutors: 'Execution Fees To Executors',
  verifierToVerifiers: 'Verifier Fees To Verifiers',
  tokenTransferToPools: 'Token Transfer Fees To Token Pools',
  tokenTransferToChainlink: 'Token Transfer Fees To Chainlink',
}

type Metric = 'dailyRevenue' | 'dailySupplySideRevenue'
const RECEIPT_ROLES: Record<string, { feeLabel: string, metric: Metric, label: string }> = {
  network: { feeLabel: LABELS.networkFees, metric: 'dailyRevenue', label: LABELS.networkToChainlink },
  executor: { feeLabel: LABELS.executionFees, metric: 'dailySupplySideRevenue', label: LABELS.executionToExecutors },
  verifier: { feeLabel: LABELS.verifierFees, metric: 'dailySupplySideRevenue', label: LABELS.verifierToVerifiers },
  v2Pool: { feeLabel: LABELS.tokenTransferFees, metric: 'dailySupplySideRevenue', label: LABELS.tokenTransferToPools },
  v1Pool: { feeLabel: LABELS.tokenTransferFees, metric: 'dailyRevenue', label: LABELS.tokenTransferToChainlink },
}

const hasToken = (log: any) => log.tokenAmountBeforeTokenPoolFees > 0n
const issuerAt = (log: any, index: number) => log.receipts[index].issuer.toLowerCase()

// OnRamp 2.0 receipt order: verifiers, token pool (only with a token), executor, network fee (issued by the Router)
function receiptRole(log: any, index: number, v2Pools: Set<string>): string {
  const count = log.receipts.length
  if (index === count - 1) return 'network'
  if (index === count - 2) return 'executor'
  if (hasToken(log) && index === count - 3) return v2Pools.has(issuerAt(log, index)) ? 'v2Pool' : 'v1Pool'
  return 'verifier'
}

async function getOnRampsByFamily(options: FetchOptions): Promise<Record<Family, string[]>> {
  const { routers, fromBlock } = chainConfig[options.chain]
  const sets = await options.getLogs({ targets: routers, eventAbi: ON_RAMP_SET, fromBlock, cacheInCloud: true })
  const onRamps = [...new Set<string>(sets.map((log: any) => log.onRamp.toLowerCase()))].filter((onRamp) => onRamp !== ADDRESSES.null)
  if (!onRamps.length) throw new Error(`chainlink-ccip: no OnRamps found on ${options.chain}`)

  // typeAndVersion never changes for a deployed OnRamp, so it is read at the latest block
  const versions: string[] = await new ChainApi({ chain: options.chain }).multiCall({ abi: 'string:typeAndVersion', calls: onRamps })
  const byFamily = Object.fromEntries(FAMILIES.map((family) => [family, [] as string[]])) as Record<Family, string[]>
  onRamps.forEach((onRamp, i) => {
    const family = FAMILY_BY_VERSION[versions[i]]
    if (!family) throw new Error(`chainlink-ccip: unknown OnRamp version "${versions[i]}" at ${onRamp} on ${options.chain}`)
    byFamily[family].push(onRamp)
  })
  return byFamily
}

// only IPoolV2 pools are paid their receipt; a v1 pool's share stays on the OnRamp
async function getV2Pools(options: FetchOptions, logs: any[]): Promise<Set<string>> {
  const pools = [...new Set(logs.filter((log) => hasToken(log) && log.receipts[log.receipts.length - 3].feeTokenAmount > 0n).map((log) => issuerAt(log, log.receipts.length - 3)))]
  if (!pools.length) return new Set()
  const isV2: boolean[] = await options.api.multiCall({ abi: 'function supportsInterface(bytes4) view returns (bool)', calls: pools.map((target) => ({ target, params: [IPOOL_V2_INTERFACE_ID] })) })
  return new Set(pools.filter((_, i) => isV2[i]))
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { routers, testRouters } = chainConfig[options.chain]
  const onRamps = await getOnRampsByFamily(options)
  const [v1_0, v1_2, v1_6, v2_0] = await Promise.all(FAMILIES.map((family) => onRamps[family].length ? options.getLogs({ targets: onRamps[family], eventAbi: SEND_EVENTS[family] }) : []))

  const balances = { dailyFees: options.createBalances(), dailyRevenue: options.createBalances(), dailySupplySideRevenue: options.createBalances() }
  const priceAs = Object.fromEntries(Object.entries(PRICE_AS[options.chain] ?? {}).map(([token, key]) => [token.toLowerCase(), key.toLowerCase()]))
  const add = (metric: keyof typeof balances, token: string, amount: bigint, label: string) => {
    const priceKey = priceAs[token.toLowerCase()]
    if (priceKey) balances[metric].add(priceKey, amount, { label, skipChain: true })
    else balances[metric].add(token, amount, label)
  }

  const addMessages = (logs: any[], metric: Metric, label: string) => {
    for (const { message } of logs) {
      add('dailyFees', message.feeToken, message.feeTokenAmount, LABELS.messagingFees)
      add(metric, message.feeToken, message.feeTokenAmount, label)
    }
  }
  // OnRamp 1.0-1.5 books every fee to node operators (s_nopFeesJuels, paid by payNops)
  addMessages([...v1_0, ...v1_2], 'dailySupplySideRevenue', LABELS.messagingToNodeOperators)
  // OnRamp 1.6 withdraws the whole fee to getDynamicConfig().feeAggregator, a Chainlink contract that forwards it to Chainlink wallets
  addMessages(v1_6, 'dailyRevenue', LABELS.messagingToChainlink)

  const routerSet = new Set(routers.map((router) => router.toLowerCase()))
  const testRouterSet = new Set(testRouters.map((router) => router.toLowerCase()))
  const v2Messages = v2_0.filter((log: any) => {
    const networkIssuer = issuerAt(log, log.receipts.length - 1)
    if (!routerSet.has(networkIssuer) && !testRouterSet.has(networkIssuer)) throw new Error(`chainlink-ccip: unknown Router ${networkIssuer} in message ${log.messageId} on ${options.chain}`)
    return routerSet.has(networkIssuer)
  })
  const v2Pools = await getV2Pools(options, v2Messages)
  for (const log of v2Messages) {
    log.receipts.forEach((receipt: any, index: number) => {
      if (receipt.feeTokenAmount === 0n) return
      const role = RECEIPT_ROLES[receiptRole(log, index, v2Pools)]
      add('dailyFees', log.feeToken, receipt.feeTokenAmount, role.feeLabel)
      add(role.metric, log.feeToken, receipt.feeTokenAmount, role.label)
    })
  }

  return { ...balances, dailyProtocolRevenue: balances.dailyRevenue.clone(1) }
}

const methodology = {
  Fees: 'Fees paid by senders of Chainlink CCIP messages and token transfers, in the fee token of each message.',
  Revenue: 'CCIP fees kept by Chainlink: the whole fee on OnRamp 1.6, and on OnRamp 2.0 the network fee plus the token transfer fee of v1 token pools, all held on the OnRamp for the fee aggregator set by Chainlink.',
  ProtocolRevenue: 'CCIP fees kept by Chainlink: the whole fee on OnRamp 1.6, and on OnRamp 2.0 the network fee plus the token transfer fee of v1 token pools, all held on the OnRamp for the fee aggregator set by Chainlink.',
  SupplySideRevenue: 'CCIP fees for node operators and other service providers: the whole fee on OnRamps 1.0 to 1.5 (booked on-chain to node operators), plus the executor, verifier and v2 token pool fees on OnRamp 2.0.',
}

const breakdownMethodology = {
  Fees: {
    [LABELS.messagingFees]: 'Total fee of each message sent through OnRamps 1.0 to 1.6, which do not split the fee by component on-chain.',
    [LABELS.networkFees]: 'Flat network fee of each OnRamp 2.0 message.',
    [LABELS.executionFees]: 'Executor fee of each OnRamp 2.0 message, including destination execution gas.',
    [LABELS.verifierFees]: 'Fees charged by the cross-chain verifiers of each OnRamp 2.0 message.',
    [LABELS.tokenTransferFees]: 'Token transfer fee of each OnRamp 2.0 message that carries a token.',
  },
  Revenue: {
    [LABELS.messagingToChainlink]: 'Whole fee on OnRamp 1.6, withdrawn to the fee aggregator set by Chainlink, which forwards it to Chainlink wallets; nothing is paid to node operators on-chain.',
    [LABELS.networkToChainlink]: 'OnRamp 2.0 network fee (protocol fee), kept by the OnRamp until it is withdrawn to the fee aggregator set by Chainlink.',
    [LABELS.tokenTransferToChainlink]: 'OnRamp 2.0 token transfer fee of v1 token pools, which the OnRamp keeps instead of paying the pool.',
  },
  ProtocolRevenue: {
    [LABELS.messagingToChainlink]: 'Whole fee on OnRamp 1.6, withdrawn to the fee aggregator set by Chainlink, which forwards it to Chainlink wallets; nothing is paid to node operators on-chain.',
    [LABELS.networkToChainlink]: 'OnRamp 2.0 network fee (protocol fee), kept by the OnRamp until it is withdrawn to the fee aggregator set by Chainlink.',
    [LABELS.tokenTransferToChainlink]: 'OnRamp 2.0 token transfer fee of v1 token pools, which the OnRamp keeps instead of paying the pool.',
  },
  SupplySideRevenue: {
    [LABELS.messagingToNodeOperators]: 'Whole fee on OnRamps 1.0 to 1.5, booked on-chain to node operators (s_nopFeesJuels) and paid in LINK through payNops.',
    [LABELS.executionToExecutors]: 'OnRamp 2.0 executor fee, paid to the executor in the same transaction.',
    [LABELS.verifierToVerifiers]: 'OnRamp 2.0 verifier fees, paid to each verifier in the same transaction.',
    [LABELS.tokenTransferToPools]: 'OnRamp 2.0 token transfer fee of v2 token pools, paid to the pool in the same transaction.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter
