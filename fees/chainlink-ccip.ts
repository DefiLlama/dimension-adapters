import { ChainApi } from "@defillama/sdk"
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

// OnRamps are discovered from each Router's OnRampSet logs, so a new OnRamp deployment is picked up without a code change.
// Routers: v1.2 from https://docs.chain.link/api/ccip/v1/chains?environment=mainnet, v1.0 from the v1.0 OffRamp configs.
// fromBlock is the first OnRampSet block on the chain (indexer + RPC, 2026-11-20).
// testRouters: Router 1.2.0 contracts owned by 0x062f05CD (also the fee aggregator of the Ethereum 2.0 OnRamps), absent from the
// directory, that sent Chainlink's own OnRamp 2.0 test messages until 2026-10-07 (one sender, 0x96056d13, on every chain). Not fees.
type ChainConfig = { start: string, fromBlock: number, routers: string[], testRouters: string[] }
const chainConfig: Record<string, ChainConfig> = {
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

// Fee tokens priced through an equivalent 18-decimal token, since coins has gaps: CCIP LINK on Polygon and BSC is never priced,
// WETH on Optimism and Arbitrum is unpriced on many 2023-2024 days, WETH on Robinhood before 2026-07-08.
// LINK addresses are the OnRamp or FeeQuoter linkToken (2026-11-20).
// Monad 0x3a70 is a second "Wrapped MON", fully backed by MON (balance = supply on 2026-11-20).
const ETHEREUM_LINK = 'ethereum:0x514910771af9ca656af840dff83e8264ecf986ca'
const ETHEREUM_WETH = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
const PRICE_AS: Record<string, Record<string, string>> = {
  [CHAIN.OPTIMISM]: { '0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6': ETHEREUM_LINK, '0x4200000000000000000000000000000000000006': ETHEREUM_WETH },
  [CHAIN.POLYGON]: { '0xb0897686c545045afc77cf20ec7a532e3120e0f1': ETHEREUM_LINK },
  [CHAIN.AVAX]: { '0x5947bb275c521040051d82396192181b413227a3': ETHEREUM_LINK },
  [CHAIN.BASE]: { '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196': ETHEREUM_LINK, '0x4200000000000000000000000000000000000006': ETHEREUM_WETH },
  [CHAIN.ARBITRUM]: { '0xf97f4df75117a78c1a5a0dbb814af92458539fb4': ETHEREUM_LINK, '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': ETHEREUM_WETH },
  [CHAIN.BSC]: { '0x404460c6a5ede2d891e8297795264fde62adbb75': ETHEREUM_LINK },
  [CHAIN.MONAD]: { '0x76f257b1dda5cc71bee4ef637fbdde4c801310a9': ETHEREUM_LINK, '0x3a704ad3e4784b935ae029171adcf57ee7988198': 'monad:0x3bd359c1119da7da1d913d1c4d2b7c461115433a' },
  [CHAIN.XLAYER]: { '0x8af9711b44695a5a081f25ab9903ddb73acf8fa9': ETHEREUM_LINK },
  [CHAIN.HYPERLIQUID]: { '0x1ac2ee68b8d038c982c1e1f73f596927dd70de59': ETHEREUM_LINK },
  [CHAIN.ROBINHOOD]: { '0x492641f648a4986844848e0befe66d14817bce34': ETHEREUM_LINK, '0x0bd7d308f8e1639fab988df18a8011f41eacad73': ETHEREUM_WETH },
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const MAX_ON_RAMPS_PER_CHAIN = 1000 // Ethereum had 84 on 2026-11-20
const MAX_RECEIPTS_PER_MESSAGE = 64
const IPOOL_V2_INTERFACE_ID = '0x940a1542' // type(IPoolV2).interfaceId, true on 2.x pools and false on 1.5/1.6 pools

const ON_RAMP_SET = 'event OnRampSet(uint64 indexed destChainSelector, address onRamp)'
const SEND_EVENTS = {
  v1_0: 'event CCIPSendRequested((uint64 sourceChainSelector, uint64 sequenceNumber, uint256 feeTokenAmount, address sender, uint64 nonce, uint256 gasLimit, bool strict, address receiver, bytes data, (address token, uint256 amount)[] tokenAmounts, address feeToken, bytes32 messageId) message)',
  v1_2: 'event CCIPSendRequested((uint64 sourceChainSelector, address sender, address receiver, uint64 sequenceNumber, uint256 gasLimit, bool strict, uint64 nonce, address feeToken, uint256 feeTokenAmount, bytes data, (address token, uint256 amount)[] tokenAmounts, bytes[] sourceTokenData, bytes32 messageId) message)',
  v1_6: 'event CCIPMessageSent(uint64 indexed destChainSelector, uint64 indexed sequenceNumber, ((bytes32 messageId, uint64 sourceChainSelector, uint64 destChainSelector, uint64 sequenceNumber, uint64 nonce) header, address sender, bytes data, bytes receiver, bytes extraArgs, address feeToken, uint256 feeTokenAmount, uint256 feeValueJuels, (address sourcePoolAddress, bytes destTokenAddress, bytes extraData, uint256 amount, bytes destExecData)[] tokenAmounts) message)',
  v2_0: 'event CCIPMessageSent(uint64 indexed destChainSelector, address indexed sender, bytes32 indexed messageId, address feeToken, uint256 tokenAmountBeforeTokenPoolFees, bytes encodedMessage, (address issuer, uint32 destGasLimit, uint32 destBytesOverhead, uint256 feeTokenAmount, bytes extraArgs)[] receipts, bytes[] verifierBlobs)',
}
type Family = keyof typeof SEND_EVENTS

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
  networkToChainlink: 'Network Fees To Chainlink',
  executionToExecutors: 'Execution Fees To Executors',
  verifierToVerifiers: 'Verifier Fees To Verifiers',
  tokenTransferToPools: 'Token Transfer Fees To Token Pools',
  tokenTransferToChainlink: 'Token Transfer Fees To Chainlink',
}

type Balances = ReturnType<FetchOptions['createBalances']>
type Sinks = { dailyFees: Balances, dailyRevenue: Balances, dailySupplySideRevenue: Balances, add: (target: Balances, token: string, amount: bigint, label: string) => void }
type Lane = { router: string, selector: string, onRamp: string, block: number, logIndex: number }

// Every OnRamp ever set on the chain's Routers. The last OnRampSet per lane must equal Router.getOnRamp at the window end,
// so a log cache that missed an update throws instead of silently dropping an OnRamp.
async function getOnRamps(options: FetchOptions): Promise<string[]> {
  const { routers, fromBlock } = chainConfig[options.chain]
  const setsByRouter: any[][] = await options.getLogs({ targets: routers, eventAbi: ON_RAMP_SET, fromBlock, cacheInCloud: true, onlyArgs: false, flatten: false })
  if (setsByRouter.length !== routers.length) throw new Error(`chainlink-ccip: got OnRampSet logs for ${setsByRouter.length} of ${routers.length} Routers on ${options.chain}`)

  const lanes = new Map<string, Lane>()
  const onRamps = new Set<string>()
  routers.forEach((router, i) => {
    for (const log of setsByRouter[i]) {
      const lane: Lane = { router, selector: String(log.args.destChainSelector), onRamp: String(log.args.onRamp).toLowerCase(), block: Number(log.blockNumber), logIndex: Number(log.logIndex ?? log.index) }
      if (!Number.isFinite(lane.block) || !Number.isFinite(lane.logIndex)) throw new Error(`chainlink-ccip: OnRampSet log without position on ${options.chain}`)
      const key = `${router}-${lane.selector}`
      const previous = lanes.get(key)
      if (!previous || lane.block > previous.block || (lane.block === previous.block && lane.logIndex > previous.logIndex)) lanes.set(key, lane)
      if (lane.onRamp !== ZERO_ADDRESS) onRamps.add(lane.onRamp)
    }
  })
  if (onRamps.size === 0) throw new Error(`chainlink-ccip: no OnRamps found on ${options.chain}`)
  if (onRamps.size > MAX_ON_RAMPS_PER_CHAIN) throw new Error(`chainlink-ccip: ${onRamps.size} OnRamps on ${options.chain} exceeds ${MAX_ON_RAMPS_PER_CHAIN}`)

  const lastSets = [...lanes.values()]
  const current: string[] = await options.api.multiCall({ abi: 'function getOnRamp(uint64) view returns (address)', calls: lastSets.map((lane) => ({ target: lane.router, params: [lane.selector] })) })
  lastSets.forEach((lane, i) => {
    if (String(current[i]).toLowerCase() !== lane.onRamp) throw new Error(`chainlink-ccip: Router ${lane.router} lane ${lane.selector} points to ${current[i]} but the last OnRampSet log has ${lane.onRamp} on ${options.chain}`)
  })
  return [...onRamps]
}

async function getOnRampsByFamily(options: FetchOptions): Promise<Record<Family, string[]>> {
  const onRamps = await getOnRamps(options)
  // typeAndVersion is immutable per OnRamp, so it is read at the latest block
  const versions: string[] = await new ChainApi({ chain: options.chain }).multiCall({ abi: 'string:typeAndVersion', calls: onRamps })
  const byFamily: Record<Family, string[]> = { v1_0: [], v1_2: [], v1_6: [], v2_0: [] }
  onRamps.forEach((onRamp, i) => {
    const family = FAMILY_BY_VERSION[versions[i]]
    if (!family) throw new Error(`chainlink-ccip: unknown OnRamp version "${versions[i]}" at ${onRamp} on ${options.chain}`)
    byFamily[family].push(onRamp)
  })
  return byFamily
}

// EVM2EVMOnRamp 1.0 to 1.5 books every fee into s_nopFeesJuels, payable only to node operators through payNops.
// OnRamp 1.6 holds the fee for the fee aggregator, and its billing docs define it as node operator gas plus a network fee to node operators.
function addNodeOperatorFees(messages: any[], sinks: Sinks) {
  for (const message of messages) {
    sinks.add(sinks.dailyFees, message.feeToken, message.feeTokenAmount, LABELS.messagingFees)
    sinks.add(sinks.dailySupplySideRevenue, message.feeToken, message.feeTokenAmount, LABELS.messagingToNodeOperators)
  }
}

// OnRamp 2.0 receipt order: verifiers, token pool (only with a token), executor, network fee (issuer is the Router)
function receiptRole(index: number, count: number, hasToken: boolean): 'verifier' | 'pool' | 'executor' | 'network' {
  if (index === count - 1) return 'network'
  if (index === count - 2) return 'executor'
  if (hasToken && index === count - 3) return 'pool'
  return 'verifier'
}

const networkIssuer = (log: any) => String(log.receipts[log.receipts.length - 1].issuer).toLowerCase()

// Returns the messages sent through production Routers, dropping test Router messages and throwing on any other issuer.
function productionMessages(logs: any[], routers: Set<string>, testRouters: Set<string>): any[] {
  for (const log of logs) {
    const count = log.receipts.length
    const hasToken = log.tokenAmountBeforeTokenPoolFees > 0n // OnRamp 2.0 reverts on zero-amount token transfers
    if (count < (hasToken ? 4 : 3) || count > MAX_RECEIPTS_PER_MESSAGE) throw new Error(`chainlink-ccip: unexpected receipt count ${count} for message ${log.messageId}`)
    const issuer = networkIssuer(log)
    if (!routers.has(issuer) && !testRouters.has(issuer)) throw new Error(`chainlink-ccip: network receipt issuer ${issuer} is not a known Router for message ${log.messageId}`)
  }
  return logs.filter((log) => routers.has(networkIssuer(log)))
}

async function getV2Pools(options: FetchOptions, logs: any[]): Promise<Set<string>> {
  const pools = new Set<string>()
  for (const log of logs) {
    const count = log.receipts.length
    if (log.tokenAmountBeforeTokenPoolFees > 0n && log.receipts[count - 3].feeTokenAmount > 0n) pools.add(String(log.receipts[count - 3].issuer).toLowerCase())
  }
  const candidates = [...pools]
  if (candidates.length === 0) return new Set()
  // in _distributeFees only IPoolV2 pools are paid their receipt, a V1 pool's share stays on the OnRamp
  const supported: boolean[] = await options.api.multiCall({ abi: 'function supportsInterface(bytes4) view returns (bool)', calls: candidates.map((target) => ({ target, params: [IPOOL_V2_INTERFACE_ID] })) })
  return new Set(candidates.filter((_, i) => supported[i] === true))
}

function addReceiptFees(logs: any[], v2Pools: Set<string>, sinks: Sinks) {
  for (const log of logs) {
    const count = log.receipts.length
    const hasToken = log.tokenAmountBeforeTokenPoolFees > 0n
    log.receipts.forEach((receipt: any, index: number) => {
      const amount = receipt.feeTokenAmount
      if (amount === 0n) return
      const role = receiptRole(index, count, hasToken)
      if (role === 'network') {
        sinks.add(sinks.dailyFees, log.feeToken, amount, LABELS.networkFees)
        sinks.add(sinks.dailyRevenue, log.feeToken, amount, LABELS.networkToChainlink)
      } else if (role === 'executor') {
        sinks.add(sinks.dailyFees, log.feeToken, amount, LABELS.executionFees)
        sinks.add(sinks.dailySupplySideRevenue, log.feeToken, amount, LABELS.executionToExecutors)
      } else if (role === 'verifier') {
        sinks.add(sinks.dailyFees, log.feeToken, amount, LABELS.verifierFees)
        sinks.add(sinks.dailySupplySideRevenue, log.feeToken, amount, LABELS.verifierToVerifiers)
      } else if (v2Pools.has(String(receipt.issuer).toLowerCase())) {
        sinks.add(sinks.dailyFees, log.feeToken, amount, LABELS.tokenTransferFees)
        sinks.add(sinks.dailySupplySideRevenue, log.feeToken, amount, LABELS.tokenTransferToPools)
      } else {
        sinks.add(sinks.dailyFees, log.feeToken, amount, LABELS.tokenTransferFees)
        sinks.add(sinks.dailyRevenue, log.feeToken, amount, LABELS.tokenTransferToChainlink)
      }
    })
  }
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const onRamps = await getOnRampsByFamily(options)
  const getSends = (family: Family) => onRamps[family].length ? options.getLogs({ targets: onRamps[family], eventAbi: SEND_EVENTS[family] }) : Promise.resolve([])
  const [v1_0, v1_2, v1_6, v2_0] = [await getSends('v1_0'), await getSends('v1_2'), await getSends('v1_6'), await getSends('v2_0')]

  const priceAs = PRICE_AS[options.chain] ?? {}
  const add = (target: Balances, token: string, amount: bigint, label: string) => {
    const key = priceAs[String(token).toLowerCase()]
    if (key) target.add(key, amount, { label, skipChain: true })
    else target.add(token, amount, label)
  }
  const sinks: Sinks = { dailyFees: options.createBalances(), dailyRevenue: options.createBalances(), dailySupplySideRevenue: options.createBalances(), add }
  addNodeOperatorFees([...v1_0, ...v1_2, ...v1_6].map((log: any) => log.message), sinks)
  const { routers, testRouters } = chainConfig[options.chain]
  const lower = (addresses: string[]) => new Set(addresses.map((address) => address.toLowerCase()))
  const v2Messages = productionMessages(v2_0, lower(routers), lower(testRouters))
  addReceiptFees(v2Messages, await getV2Pools(options, v2Messages), sinks)

  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = sinks
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue.clone(1) }
}

const methodology = {
  Fees: 'Fees paid by senders of Chainlink CCIP messages and token transfers, in the fee token of each message.',
  Revenue: 'CCIP protocol fee kept by Chainlink since OnRamp 2.0: the network fee of each message plus the token transfer fee of v1 token pools, held on the OnRamp for the fee aggregator. Fees of earlier OnRamps went to node operators.',
  ProtocolRevenue: 'CCIP protocol fee kept by Chainlink since OnRamp 2.0: the network fee of each message plus the token transfer fee of v1 token pools, held on the OnRamp for the fee aggregator.',
  SupplySideRevenue: 'CCIP fees for node operators and other service providers: the whole fee on OnRamps 1.0 to 1.6 (gas and network fee for node operators), plus the executor, verifier and v2 token pool fees on OnRamp 2.0.',
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
    [LABELS.networkToChainlink]: 'OnRamp 2.0 network fee (protocol fee), kept by the OnRamp until it is withdrawn to the fee aggregator set by Chainlink.',
    [LABELS.tokenTransferToChainlink]: 'OnRamp 2.0 token transfer fee of v1 token pools, which the OnRamp keeps instead of paying the pool.',
  },
  ProtocolRevenue: {
    [LABELS.networkToChainlink]: 'OnRamp 2.0 network fee (protocol fee), kept by the OnRamp until it is withdrawn to the fee aggregator set by Chainlink.',
    [LABELS.tokenTransferToChainlink]: 'OnRamp 2.0 token transfer fee of v1 token pools, which the OnRamp keeps instead of paying the pool.',
  },
  SupplySideRevenue: {
    [LABELS.messagingToNodeOperators]: 'Whole fee on OnRamps 1.0 to 1.6: booked on-chain to node operators and paid in LINK up to 1.5, and paid out of the fee aggregator on 1.6, whose billing docs define it as node operator gas plus a network fee paid to node operators.',
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
