import { Balances, ChainApi } from '@defillama/sdk'
import { AbiCoder, Interface, ZeroAddress, keccak256, zeroPadValue, id as eventTopic } from 'ethers'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'
import { getTransactionsWithRetry } from '../helpers/getTxReceipts'

// Addresses: github.com/src-company/tacit contracts/deployments/{1-createx,1,evm-pool}.json, dapp/evm-pool-tokens.js
const POOL = '0x000000000Ed1eabD231Be41d93b719056F7febFC'
const POOL_DEPLOY_BLOCK = 25998736
const PUBLIC_AMM = '0x00000000E36C7EC997CC59DCda9E03673B448119'
const ROUTER = '0x000000005dA3E3B73726af3c774Deeb9472D4992'
const SETTLE_TIP_FORWARDER = '0x0000008353ee6Dea1236544938C546E27010416D'
const PROOF_MARKET = '0x0000000033Dd45B1686Ba37e5F6e4ABDdaC17609'
const TAC_BUYBACK = '0x6919cbEf0e70AFFA02Ae02c86c532A137154f250'
const TAC = '0xA1313eb9f3A445606D9583bcAc3ebeB56a858279'
const WTAC = '0x2018139a8FDd3666855BE3315C7683b4D6aB7AEf' // WrappedTac.sol: 1:1 with TAC in base units
const WRAP_TIP_FORWARDER = '0x000000D218B03db5837943b0b05DeA2965AE956e'
const WRAP_TOKEN_TIP_FORWARDER = '0x0000007b1d93d72f698A861aA86Ac675D6AF7216'
const ESCROW_TIP_FORWARDERS = ['0x000000006fcb52Aa67AC4A420a4D43A0e48F136F', '0x000000fB551f7Ef4936a59ECdD431ae253139E8d']
const EVM_ETH_POOL = '0x000000c2A20657CE25f2Ba99737933D031AFBEE9'

const lower = (list: string[]) => new Set(list.map((a) => a.toLowerCase()))
// Tacit's settle wallets and relay wallet (worker-relay render.yaml SETTLE_ADDRESS and RELAY_ADDRESS)
const TACIT_RELAY = lower(['0x7a0F0511E1DcF399C2F7bbe8414b6a0D1ABc4331', '0xb2daf4571cf2afffa34482b34a6ece01137e59dd', '0x68575B073DE49a94e3E3ACf6F3A0d6E3b66267C7'])
// ops multisig, EthSplitter (pays the relay wallet, the settle wallet and TacBuyback) and the relay wallet
const TACIT_TIP_RECIPIENTS = lower(['0x006CD14F36F65eCbB29b2519cCBe63A0DC8549F2', '0xf5eBBE5Db610F64D29A0dC5e9534074Af12834F9', '0x68575B073DE49a94e3E3ACf6F3A0d6E3b66267C7'])
// ops multisig and the farm funding wallet: settles paying out to them move Tacit's own notes
const TACIT_TREASURY = lower(['0x006CD14F36F65eCbB29b2519cCBe63A0DC8549F2', '0xfD1Fa372cA3f94F67E91595dD49dBF939381b5d2'])
// Tacit-made tokens, valued last when a swap has a better-priced leg
const TACIT_TOKENS = lower([TAC, WTAC, '0xdf1d99148bEb7a9AFf1d95C49B3d22b7ed90D696', '0x23cACFFAc2674514A6d4F6cD420B4cc2aC921564', '0xA0f6B02561C8ef08335B69aD25e022C0B342147C', '0x9DE27883C5Dc9Db47BE12E595D59b8f1aBEC8570'])

// TacitEvmPool instances served by Tacit's keepers (tacit-evm-pool-keepers.onrender.com/chains), pool => immutable ASSET()
const chainConfig: Record<string, { start: string, keeper: string, evmPools: Record<string, string> }> = {
  [CHAIN.ETHEREUM]: {
    start: '2026-09-18', keeper: '0x7c9f8aE4e48Cbb2727F95b6477a1cf92bCFc43D0',
    evmPools: {
      [EVM_ETH_POOL]: ZeroAddress,
      '0x0000007F401114398b8fa67b4Bf1e1CFEcd28ffe': TAC,
      '0x0000007bDb91d1aa0b5D3106Fd1c44C784b33DBA': '0xA0f6B02561C8ef08335B69aD25e022C0B342147C',
      '0x00000091974fB81e7eBA4cF2Cb24869c00a9A1a1': '0x9DE27883C5Dc9Db47BE12E595D59b8f1aBEC8570',
      '0x6C0be904750Fe1b50cd7207cc94731642d99e908': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      '0x73872ceEaADd2C603BD057073D403f08DCB31EB9': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      '0x0a83Fb67EE2708F10BCdd8FE23Fa3B30A0247Aac': '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    },
  },
  [CHAIN.BASE]: {
    start: '2026-09-27', keeper: '0xfA2afbaB631C7Eda7CeA6AE1440605C504E322Ec',
    evmPools: {
      [EVM_ETH_POOL]: ZeroAddress,
      '0xCAf6BE2e337AEcAB4a4eA183452f78800fD1616D': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      '0xC720d51Fa8B768F6b0ba58Bf0812CA76355bcee4': '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      '0x95e51d1BF626390c2C99b748d7A2D31829D94746': '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
    },
  },
  [CHAIN.ROBINHOOD]: {
    start: '2026-09-27', keeper: '0xc1F8DAc6BC910A5A794b4795b5F9997e0E8A5Fad',
    evmPools: {
      [EVM_ETH_POOL]: ZeroAddress,
      '0x4430C0eFdFef640d54abB5a7cDdC63819468d8CA': '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      '0x1BC62D5fF0a76b8f944C70Bf324EAf9a028f062F': '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
    },
  },
}

const MAX_SETTLE_TXS = 20_000
const MAX_CANDIDATE_BLOCKS = 5_000
const AMM_FEE_TIER_BPS = 30n // the only tier with initialized pools, ConfidentialPool MAX_POOL_FEE_BPS is 1000
const BPS = 10_000n
const PV_VERSION = 1n

const LABEL = {
  RELAY: 'Relay Fees', RELAY_TO_TACIT: 'Relay Fees To Tacit Relay', RELAY_TO_OTHERS: 'Relay Fees To Third-Party Relayers',
  TIPS: 'Relay Tips', TIPS_TO_TACIT: 'Relay Tips To Tacit Relay', TIPS_TO_OTHERS: 'Relay Tips To Third-Party Relayers',
  PROVING: 'Proving Fees', PROVING_TO_TACIT: 'Proving Fees To Tacit Relay', PROVING_TO_OTHERS: 'Proving Fees To Third-Party Provers',
  SWAP: METRIC.SWAP_FEES, SWAP_TO_LPS: 'Token Swap Fees To LPs', SWAP_TO_CREATORS: 'Token Swap Fees To Pool Creators',
}

// ConfidentialPool.sol PublicValues (version 1, Sourcify full match)
const CDP_LEG = 'tuple(bytes32 asset, uint256 value)'
const PV_TYPE = `tuple(uint16 version, bytes32 chainBinding, bytes32 spendRoot, bytes32[] nullifiers, bytes32[] leaves, bytes32[] depositsConsumed,
 tuple(bytes32 assetId, address recipient, uint256 value)[] withdrawals, tuple(bytes32 assetId, uint256 value)[] fees, bytes32[] bitcoinBurnsConsumed,
 tuple(uint16 destChain, bytes32 destCommitment, bytes32 nullifier, bytes32 assetId, bytes32 claimId)[] crossOuts, bytes32[] bitcoinRootsUsed,
 bytes32 bitcoinSpentRoot, bytes32 bitcoinBurnRoot,
 tuple(bytes32 poolId, uint256 reserveAPre, uint256 reserveBPre, uint256 reserveAPost, uint256 reserveBPost, uint256 cutA, uint256 cutB)[] swaps,
 tuple(bytes32 poolId, uint256 reserveAPre, uint256 reserveBPre, uint256 sharesPre, uint256 reserveAPost, uint256 reserveBPost, uint256 sharesPost)[] liquidity,
 uint64 deadline, bytes32 lockSetRoot, bytes32[] lockLeaves, bytes32[] lockNullifiers, bytes32[] adaptorClaimS, uint64 refundNotBefore, bytes32 cdpPositionRoot,
 tuple(address controller, bytes32 debtAsset, uint256 debtValue, bytes32 positionLeaf, uint256 rateSnapshot, ${CDP_LEG}[] legs, bytes32 owner)[] cdpMints,
 tuple(address controller, uint256 debtValue, uint256 repaid, uint256 rateSnapshot, bytes32 positionNullifier, ${CDP_LEG}[] legs)[] cdpCloses,
 tuple(address controller, uint256 debtValue, uint256 repaid, uint256 rateSnapshot, bytes32 positionNullifier, ${CDP_LEG}[] legs)[] cdpLiquidations,
 tuple(address controller, uint256 debtValue, uint256 rateSnapshot, bytes32 oldPositionNullifier, bytes32 newPositionLeaf, ${CDP_LEG}[] oldLegs, ${CDP_LEG}[] newLegs)[] cdpTopups,
 tuple(bytes32 outpoint, uint256 vBtc, bytes32 commitment)[] cbtcMints, bytes32 memoRoot, bytes32[] bitcoinConsumedSources, bytes32[] bitcoinBurnIdsConsumed,
 bytes32[] harvestActionIds)`.replace(/\s+/g, ' ')

const PERMIT_SINGLE = '((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline)'
const INTENT = '(address payer, bytes32 opId, uint256 floorFee, uint256 maxFee, uint64 start, uint64 rampSecs, uint64 deadline, bytes32 tank)'
// verified functions that pass publicValues into ConfidentialPool.settle
const SETTLE_CALLERS: Record<string, Interface> = {
  [POOL.toLowerCase()]: new Interface([
    'function settle(bytes publicValues, bytes proofBytes, bytes[] memos)',
    'function createPairAndSettle(bytes32 assetA, bytes32 assetB, uint32 feeBps, bytes publicValues, bytes proofBytes, bytes[] memos)',
  ]),
  [ROUTER.toLowerCase()]: new Interface([
    'function exitAndExecute(bytes publicValues, bytes proofBytes, bytes[] memos, (bytes32 exitedAsset, address feeAsset, address finalRecipient, uint64 deadline, uint256 nonce, (address target, uint256 value, address token, uint256 amount, bool push, bytes data)[] calls, address[] sweepTokens, uint256[] minOuts) recipe)',
    'function wrapAndMintCusdWithPermit(address token, uint256 amount, bytes32 commit, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes publicValues, bytes proof, bytes[] memos)',
    `function wrapAndMintCusdWithPermit2(address token, uint256 amount, bytes32 commit, ${PERMIT_SINGLE} permitSingle, bytes signature, bytes publicValues, bytes proof, bytes[] memos)`,
    'function wrapAndSettleETH(uint256 wrapAmount, bytes32 commit, bytes publicValues, bytes proof, bytes[] memos, address feeRecipient) payable',
    'function wrapAndSettleWithPermit(address token, uint256 amount, bytes32 commit, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes publicValues, bytes proof, bytes[] memos, address feeRecipient) payable',
    `function wrapAndSettleWithPermit2(address token, uint256 amount, bytes32 commit, ${PERMIT_SINGLE} permitSingle, bytes signature, bytes publicValues, bytes proof, bytes[] memos, address feeRecipient) payable`,
    'function wrapETHAndMintCusd(bytes32 commit, bytes publicValues, bytes proof, bytes[] memos) payable',
    'function zapETHIntoFarm(address tokenB, uint32 feeBps, uint256 ethLeg, uint256 tokenBLeg, uint256 minShares, uint64 deadline, bytes32 commit, bytes zrSwapData, bytes publicValues, bytes proof, bytes[] memos) payable',
    'function zapETHToCanonicalCdpMint(bytes32 assetId, uint256 wrapAmount, bytes32 commit, bytes zrSwapData, bytes publicValues, bytes proof, bytes[] memos) payable',
    'function zapETHToCdpMint(address tokenOut, uint256 wrapAmount, bytes32 commit, bytes zrSwapData, bytes publicValues, bytes proof, bytes[] memos) payable',
    'function zapETHToPayment(address tokenOut, uint256 wrapAmount, bytes32 commit, bytes zrSwapData, bytes publicValues, bytes proof, bytes[] memos) payable',
    `function zapTokenIntoFarm((address tokenB, uint32 feeBps, uint256 tokenAForSwap, uint256 tokenAForLP, uint256 tokenBLeg, uint256 minShares, uint64 deadline, bytes32 commit) z, ${PERMIT_SINGLE} permitSingle, bytes signature, bytes zrSwapData, bytes publicValues, bytes proof, bytes[] memos)`,
    `function zapTokenToCanonicalCdpMintWithPermit2(bytes32 assetId, uint256 amountIn, uint256 wrapAmount, bytes32 commit, ${PERMIT_SINGLE} permitSingle, bytes signature, bytes zrSwapData, bytes publicValues, bytes proof, bytes[] memos)`,
    `function zapTokenToCdpMintWithPermit2(address tokenOut, uint256 amountIn, uint256 wrapAmount, bytes32 commit, ${PERMIT_SINGLE} permitSingle, bytes signature, bytes zrSwapData, bytes publicValues, bytes proof, bytes[] memos)`,
  ]),
  [SETTLE_TIP_FORWARDER.toLowerCase()]: new Interface(['function settleWithTip(bytes publicValues, bytes proofBytes, bytes[] memos, address tipRecipient) payable']),
  [PROOF_MARKET.toLowerCase()]: new Interface([
    `function fulfill(${INTENT} i, bytes signature, bytes publicValues, bytes proofBytes, bytes[] memos, uint8 v, bytes32 r, bytes32 s)`,
    `function fulfillFromTank((address payer, address delegate, uint256 cap, uint256 perOpMax, uint64 expiry, uint256 salt) t, bytes tankSig, ${INTENT} i, bytes intentSig, bytes publicValues, bytes proofBytes, bytes[] memos, uint8 v, bytes32 r, bytes32 s)`,
  ]),
}

const EVENTS = {
  nullifiersSpent: 'event NullifiersSpent(bytes32[] nullifiers)',
  leavesInserted: 'event LeavesInserted(uint256 indexed firstLeafIndex, bytes32[] leaves, bytes[] memos)',
  assetRegistered: 'event AssetRegistered(bytes32 indexed assetId, address indexed underlying, uint256 unitScale, string name, string symbol, uint8 decimals)',
  transact: 'event Transact(bytes32 indexed nf0, bytes32 indexed nf1, bytes32 outLeaf0, bytes32 outLeaf1, uint256 firstIndex, bytes32 newRoot, address recipient, int256 extAmount, address relayer, uint256 fee, bytes memo0, bytes memo1)',
  wrappedWithTip: 'event WrappedWithTip(bytes32 indexed depositCommit, uint256 amount, uint256 tip, address indexed tipRecipient)',
  tokenWrappedWithTip: 'event WrappedWithTip(bytes32 indexed assetId, bytes32 indexed depositCommit, uint256 amount, uint256 tip, address indexed tipRecipient)',
  settledWithTip: 'event SettledWithTip(address indexed caller, uint256 tip, address indexed tipRecipient)',
  escrowSettledWithTip: 'event EscrowSettledWithTip(bytes32 indexed outpoint, uint256 stakeAmount, uint256 tip, address indexed tipRecipient)',
  fulfilled: 'event Fulfilled(bytes32 indexed opId, address indexed payer, address indexed solver, uint256 price)',
  bought: 'event Bought(uint8 indexed venue, uint256 ethIn, uint256 tacOut)',
}
const POOLS_ABI = 'function pools(bytes32) view returns (bool init, bytes32 assetA, bytes32 assetB, uint256 reserveA, uint256 reserveB, uint32 feeBps, uint256 totalShares)'
const ASSETS_ABI = 'function assets(bytes32) view returns (bool registered, address underlying, uint256 unitScale, bytes32 crossChainLink, bool poolMinted, uint8 decimals)'
const TRANSFER_TOPIC = eventTopic('Transfer(address,address,uint256)')
const coder = AbiCoder.defaultAbiCoder()

type Out = { dailyFees: Balances, dailyRevenue: Balances, dailySupplySideRevenue: Balances, dailyVolume: Balances }
type Asset = { underlying: string, unitScale: bigint, poolMinted: boolean }
type Settle = { hash: string, block: number, from: string, pv: any, skim?: { fee: bigint, recipient: string } }
type PoolState = { a: bigint, b: bigint, s: bigint }
type PoolInfo = { assetA: string, assetB: string, feeBps: bigint }

const blockOf = (log: any) => Number(log.blockNumber)
const hashOf = (log: any) => String(log.transactionHash).toLowerCase()

function addAsset(balances: Balances, asset: Asset, amount: bigint, label?: string) {
  if (asset.underlying === ZeroAddress) balances.addGasToken(amount, label)
  else balances.add(asset.underlying.toLowerCase() === WTAC.toLowerCase() ? TAC : asset.underlying, amount, label)
}

function addSplit(out: Out, isTacit: boolean, add: (b: Balances, label: string) => void, labels: [string, string, string]) {
  add(out.dailyFees, labels[0])
  if (isTacit) add(out.dailyRevenue, labels[1])
  else add(out.dailySupplySideRevenue, labels[2])
}

// TacitEvmPool: one relayer fee per transact, paid from the shielded note in the pool's asset
async function addEvmPoolRelayFees(options: FetchOptions, out: Out) {
  const { keeper, evmPools } = chainConfig[options.chain]
  const assetOf = Object.fromEntries(Object.entries(evmPools).map(([pool, asset]) => [pool.toLowerCase(), asset]))
  const logs = await options.getLogs({ targets: Object.keys(evmPools), eventAbi: EVENTS.transact, onlyArgs: false })
  for (const log of logs) {
    const fee = BigInt(log.args.fee)
    if (fee === 0n) continue
    const token = assetOf[String(log.address ?? log.source).toLowerCase()]
    if (token === undefined) throw new Error(`tacit: Transact from unknown pool ${log.address ?? log.source}`)
    const asset = { underlying: token, unitScale: 1n, poolMinted: false }
    const isTacit = String(log.args.relayer).toLowerCase() === keeper.toLowerCase()
    addSplit(out, isTacit, (b, l) => addAsset(b, asset, fee, l), [LABEL.RELAY, LABEL.RELAY_TO_TACIT, LABEL.RELAY_TO_OTHERS])
  }
}

function decodeSettleTx(tx: any): { pv: any, skim?: { fee: bigint, recipient: string } } | null {
  const iface = SETTLE_CALLERS[String(tx.to ?? '').toLowerCase()]
  const parsed = iface?.parseTransaction({ data: tx.data, value: tx.value })
  if (!parsed) return null
  const pvHex: string = parsed.args.publicValues
  const [pv] = coder.decode([PV_TYPE], pvHex)
  if (BigInt(pv.version) !== PV_VERSION) throw new Error(`tacit: PublicValues version ${pv.version} in ${tx.hash}`)
  if (coder.encode([PV_TYPE], [pv]).toLowerCase() !== pvHex.toLowerCase()) throw new Error(`tacit: PublicValues round-trip mismatch in ${tx.hash}`)
  let skim
  // ConfidentialRouter._skimFee: the ETH sent on top of the wrap goes to the caller-named relay
  if (parsed.name === 'wrapAndSettleETH') skim = { fee: BigInt(tx.value) - BigInt(parsed.args.wrapAmount), recipient: parsed.args.feeRecipient }
  else if (parsed.name.startsWith('wrapAndSettleWithPermit')) skim = { fee: BigInt(tx.value), recipient: parsed.args.feeRecipient }
  return { pv, skim }
}

// every fee, swap and liquidity change sits only in settle() calldata, found via the pool's note events
async function loadSettles(options: FetchOptions): Promise<{ settles: Settle[], undecodedBlocks: Set<number> }> {
  const [spent, inserted] = await Promise.all([
    options.getLogs({ target: POOL, eventAbi: EVENTS.nullifiersSpent, entireLog: true, parseLog: false }),
    options.getLogs({ target: POOL, eventAbi: EVENTS.leavesInserted, entireLog: true, parseLog: false }),
  ])
  const blockByHash = new Map<string, number>()
  for (const log of [...spent, ...inserted]) blockByHash.set(hashOf(log), blockOf(log))
  if (blockByHash.size > MAX_SETTLE_TXS) throw new Error(`tacit: ${blockByHash.size} settle txs exceeds the bound ${MAX_SETTLE_TXS}`)
  const hashes = [...blockByHash.keys()]
  const txs = await getTransactionsWithRetry(options.chain, hashes)
  const settles: Settle[] = []
  const undecodedBlocks = new Set<number>()
  hashes.forEach((hash, i) => {
    const tx = txs[i]
    if (!tx) throw new Error(`tacit: transaction ${hash} not found on ${options.chain}`)
    const decoded = decodeSettleTx(tx)
    // third-party contracts (7702 relayers, 4337 bundlers) call settle internally and cannot be decoded from tx input
    if (!decoded) {
      undecodedBlocks.add(blockByHash.get(hash)!)
      return
    }
    settles.push({ hash, block: blockByHash.get(hash)!, from: String(tx.from).toLowerCase(), ...decoded })
  })
  return { settles, undecodedBlocks }
}

async function loadAssets(options: FetchOptions, assetIds: string[]): Promise<Record<string, Asset>> {
  const unique = [...new Set(assetIds.map((a) => a.toLowerCase()))]
  const rows = await options.toApi.multiCall({ abi: ASSETS_ABI, target: POOL, calls: unique })
  const out: Record<string, Asset> = {}
  unique.forEach((id, i) => {
    if (!rows[i]?.registered) throw new Error(`tacit: asset ${id} is not registered in the pool`)
    out[id] = { underlying: rows[i].underlying, unitScale: BigInt(rows[i].unitScale), poolMinted: rows[i].poolMinted }
  })
  return out
}

function addSettleRelayFees(out: Out, settles: Settle[], assets: Record<string, Asset>) {
  for (const s of settles) {
    // a third-party sender binds the fee to itself (mostly self-settles), so only Tacit's relay earns it
    if (!TACIT_RELAY.has(s.from)) continue
    if (s.pv.withdrawals.some((w: any) => TACIT_TREASURY.has(String(w.recipient).toLowerCase()))) continue
    for (const f of s.pv.fees) {
      const asset = assets[String(f.assetId).toLowerCase()]
      const amount = BigInt(f.value) * asset.unitScale
      addSplit(out, true, (b, l) => addAsset(b, asset, amount, l), [LABEL.RELAY, LABEL.RELAY_TO_TACIT, LABEL.RELAY_TO_OTHERS])
    }
  }
}

async function addTips(options: FetchOptions, out: Out, settles: Settle[]) {
  const eth: Asset = { underlying: ZeroAddress, unitScale: 1n, poolMinted: false }
  const [wrapTips, tokenWrapTips, settleTips, escrowTips] = await Promise.all([
    options.getLogs({ target: WRAP_TIP_FORWARDER, eventAbi: EVENTS.wrappedWithTip }),
    options.getLogs({ target: WRAP_TOKEN_TIP_FORWARDER, eventAbi: EVENTS.tokenWrappedWithTip }),
    options.getLogs({ target: SETTLE_TIP_FORWARDER, eventAbi: EVENTS.settledWithTip }),
    options.getLogs({ targets: ESCROW_TIP_FORWARDERS, eventAbi: EVENTS.escrowSettledWithTip }),
  ])
  const tips: { fee: bigint, recipient: string }[] = [...wrapTips, ...tokenWrapTips, ...settleTips, ...escrowTips]
    .map((e: any) => ({ fee: BigInt(e.tip), recipient: e.tipRecipient }))
  for (const s of settles) if (s.skim) tips.push(s.skim)
  for (const t of tips) {
    if (t.fee <= 0n || t.recipient === ZeroAddress) continue
    const isTacit = TACIT_TIP_RECIPIENTS.has(t.recipient.toLowerCase())
    addSplit(out, isTacit, (b, l) => addAsset(b, eth, t.fee, l), [LABEL.TIPS, LABEL.TIPS_TO_TACIT, LABEL.TIPS_TO_OTHERS])
  }
}

async function addProvingFees(options: FetchOptions, out: Out) {
  const tac: Asset = { underlying: TAC, unitScale: 1n, poolMinted: true }
  const fills = await options.getLogs({ target: PROOF_MARKET, eventAbi: EVENTS.fulfilled })
  for (const f of fills) {
    const isTacit = TACIT_RELAY.has(String(f.solver).toLowerCase())
    addSplit(out, isTacit, (b, l) => addAsset(b, tac, BigInt(f.price), l), [LABEL.PROVING, LABEL.PROVING_TO_TACIT, LABEL.PROVING_TO_OTHERS])
  }
}

// canonical pools of every registered asset pair at the 30 bps tier, plus any pool the window's settles touched
async function loadPools(options: FetchOptions, settles: Settle[]): Promise<{ ids: string[], info: Record<string, PoolInfo>, assetIds: string[] }> {
  const registered = await options.getLogs({ target: POOL, eventAbi: EVENTS.assetRegistered, fromBlock: POOL_DEPLOY_BLOCK, toBlock: await options.getToBlock(), cacheInCloud: true })
  const assetIds = [...new Set(registered.map((r: any) => String(r.assetId).toLowerCase()))].sort()
  const candidates = new Set<string>()
  for (let i = 0; i < assetIds.length; i++) for (let j = i + 1; j < assetIds.length; j++) {
    candidates.add(keccak256(coder.encode(['bytes32', 'bytes32', 'uint32'], [assetIds[i], assetIds[j], AMM_FEE_TIER_BPS])))
  }
  for (const s of settles) for (const x of [...s.pv.swaps, ...s.pv.liquidity]) candidates.add(String(x.poolId).toLowerCase())
  const ids = [...candidates]
  const rows = await options.toApi.multiCall({ abi: POOLS_ABI, target: POOL, calls: ids })
  const info: Record<string, PoolInfo> = {}
  const live = ids.filter((id, i) => {
    if (!rows[i].init) return false
    info[id] = { assetA: String(rows[i].assetA).toLowerCase(), assetB: String(rows[i].assetB).toLowerCase(), feeBps: BigInt(rows[i].feeBps) }
    return true
  })
  return { ids: live, info, assetIds }
}

async function readPoolStates(chain: string, block: number, ids: string[]): Promise<Record<string, PoolState>> {
  const api = new ChainApi({ chain, block })
  const rows = await api.multiCall({ abi: POOLS_ABI, target: POOL, calls: ids })
  return Object.fromEntries(ids.map((id, i) => [id, { a: BigInt(rows[i].reserveA), b: BigInt(rows[i].reserveB), s: BigInt(rows[i].totalShares) }]))
}

// one side of a swap valued in its best-priced leg, and the pool fee expressed in that same leg
function addSwap(out: Out, info: PoolInfo, assets: Record<string, Asset>, inA: bigint, inB: bigint, cutIn: bigint) {
  const aIsInput = inA > 0n
  const [inId, outId, amountIn, amountOut] = aIsInput ? [info.assetA, info.assetB, inA, -inB] : [info.assetB, info.assetA, inB, -inA]
  const rank = (id: string) => (assets[id].underlying === ZeroAddress ? 0 : TACIT_TOKENS.has(assets[id].underlying.toLowerCase()) ? 2 : 1)
  const useInput = rank(inId) <= rank(outId)
  const leg = useInput ? assets[inId] : assets[outId]
  const legAmount = useInput ? amountIn : amountOut
  // Uniswap v2 math: fee = in * f, and out is worth in * (1 - f) at the trade's own execution price
  const fee = useInput ? (amountIn * info.feeBps) / BPS : (amountOut * info.feeBps) / (BPS - info.feeBps)
  const feeIn = (amountIn * info.feeBps) / BPS
  const cut = feeIn > 0n ? (fee * cutIn) / feeIn : 0n
  addAsset(out.dailyVolume, leg, legAmount * leg.unitScale)
  addAsset(out.dailyFees, leg, fee * leg.unitScale, LABEL.SWAP)
  addAsset(out.dailySupplySideRevenue, leg, (fee - cut) * leg.unitScale, LABEL.SWAP_TO_LPS)
  if (cut > 0n) addAsset(out.dailySupplySideRevenue, leg, cut * leg.unitScale, LABEL.SWAP_TO_CREATORS)
}

// blocks where a public AMM op or an undecodable settle can move reserves
async function loadCandidateBlocks(options: FetchOptions, settles: Settle[], undecodedBlocks: Set<number>, poolAssets: Asset[]) {
  const settleHashes = new Set(settles.map((s) => s.hash))
  const tokens = [...new Set(poolAssets.filter((a) => a.underlying !== ZeroAddress).map((a) => a.underlying))]
  const minted = [...new Set(poolAssets.filter((a) => a.poolMinted && a.underlying !== ZeroAddress).map((a) => a.underlying))]
  const escrow = tokens.filter((t) => !minted.includes(t))
  const query = (targets: string[], topics: (string | null)[]) => targets.length
    ? options.getLogs({ targets, topics, eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)', entireLog: true, parseLog: false })
    : Promise.resolve([])
  const [intoAmm, mints, fromPool] = await Promise.all([
    query(tokens, [TRANSFER_TOPIC, null, zeroPadValue(PUBLIC_AMM, 32)]),
    query(minted, [TRANSFER_TOPIC, zeroPadValue(ZeroAddress, 32)]),
    query(escrow, [TRANSFER_TOPIC, zeroPadValue(POOL, 32)]),
  ])
  const blocks = new Set<number>(undecodedBlocks)
  for (const log of intoAmm) blocks.add(blockOf(log))
  for (const log of [...mints, ...fromPool]) if (!settleHashes.has(hashOf(log))) blocks.add(blockOf(log))
  if (blocks.size > MAX_CANDIDATE_BLOCKS) throw new Error(`tacit: ${blocks.size} candidate blocks exceeds the bound ${MAX_CANDIDATE_BLOCKS}`)
  return [...blocks].sort((x, y) => x - y)
}

function settleDeltas(settles: Settle[]): Map<string, PoolState> {
  const deltas = new Map<string, PoolState>()
  const bump = (key: string, a: bigint, b: bigint, s: bigint) => {
    const d = deltas.get(key) ?? { a: 0n, b: 0n, s: 0n }
    deltas.set(key, { a: d.a + a, b: d.b + b, s: d.s + s })
  }
  for (const st of settles) {
    for (const x of st.pv.swaps) bump(`${st.block}:${String(x.poolId).toLowerCase()}`, BigInt(x.reserveAPost) - BigInt(x.reserveAPre), BigInt(x.reserveBPost) - BigInt(x.reserveBPre), 0n)
    for (const x of st.pv.liquidity) bump(`${st.block}:${String(x.poolId).toLowerCase()}`, BigInt(x.reserveAPost) - BigInt(x.reserveAPre), BigInt(x.reserveBPost) - BigInt(x.reserveBPre), BigInt(x.sharesPost) - BigInt(x.sharesPre))
  }
  return deltas
}

// TacBuyback's own swaps on the Tacit pool are protocol actions, not volume
async function loadBuybackDeltas(options: FetchOptions, assets: Record<string, Asset>, info: Record<string, PoolInfo>): Promise<Map<string, PoolState>> {
  const out = new Map<string, PoolState>()
  const buys = (await options.getLogs({ target: TAC_BUYBACK, eventAbi: EVENTS.bought, onlyArgs: false })).filter((l: any) => Number(l.args.venue) === 0)
  if (!buys.length) return out
  const [poolId, ethAsset] = (await options.toApi.batchCall([{ target: TAC_BUYBACK, abi: 'bytes32:POOL_ID' }, { target: TAC_BUYBACK, abi: 'bytes32:ETH_ASSET' }])).map((x: string) => x.toLowerCase())
  const pool = info[poolId]
  if (!pool) throw new Error(`tacit: buyback pool ${poolId} not found`)
  const ethIsA = pool.assetA === ethAsset
  for (const l of buys) {
    const vIn = BigInt(l.args.ethIn) / assets[ethAsset].unitScale
    const vOut = BigInt(l.args.tacOut) / assets[ethIsA ? pool.assetB : pool.assetA].unitScale
    const key = `${blockOf(l)}:${poolId}`
    const d = out.get(key) ?? { a: 0n, b: 0n, s: 0n }
    out.set(key, ethIsA ? { a: d.a + vIn, b: d.b - vOut, s: d.s } : { a: d.a - vOut, b: d.b + vIn, s: d.s })
  }
  return out
}

async function addAmmSwaps(options: FetchOptions, out: Out, settles: Settle[], undecodedBlocks: Set<number>) {
  const { ids, info, assetIds } = await loadPools(options, settles)
  const assets = await loadAssets(options, [...assetIds, ...ids.flatMap((id) => [info[id].assetA, info[id].assetB])])
  for (const s of settles) for (const x of s.pv.swaps) {
    const id = String(x.poolId).toLowerCase()
    const inA = BigInt(x.reserveAPost) - BigInt(x.reserveAPre) + BigInt(x.cutA)
    const inB = BigInt(x.reserveBPost) - BigInt(x.reserveBPre) + BigInt(x.cutB)
    if (inA === 0n && inB === 0n) continue
    if ((inA > 0n) === (inB > 0n)) throw new Error(`tacit: swap settlement with same-sign reserve moves in ${s.hash}`)
    addSwap(out, info[id], assets, inA, inB, inA > 0n ? BigInt(x.cutA) : BigInt(x.cutB))
  }
  const fromBlock = await options.getFromBlock()
  const toBlock = await options.getToBlock()
  const poolAssets = [...new Set(ids.flatMap((id) => [info[id].assetA, info[id].assetB]))].map((a) => assets[a])
  const blocks = await loadCandidateBlocks(options, settles, undecodedBlocks, poolAssets)
  const deltas = settleDeltas(settles)
  const buybacks = await loadBuybackDeltas(options, assets, info)
  const states = new Map<number, Record<string, PoolState>>()
  const stateAt = async (block: number) => {
    if (!states.has(block)) states.set(block, await readPoolStates(options.chain, block, ids))
    return states.get(block)!
  }
  const explained: Record<string, PoolState> = Object.fromEntries(ids.map((id) => [id, { a: 0n, b: 0n, s: 0n }]))
  for (const [key, d] of deltas) {
    const id = key.split(':')[1]
    if (!explained[id]) throw new Error(`tacit: settle touched pool ${id} that is not initialized`)
    explained[id] = { a: explained[id].a + d.a, b: explained[id].b + d.b, s: explained[id].s + d.s }
  }
  for (const block of blocks) {
    const [before, after] = [await stateAt(block - 1), await stateAt(block)]
    for (const id of ids) {
      const zero = { a: 0n, b: 0n, s: 0n }
      const sd = deltas.get(`${block}:${id}`) ?? zero
      const bb = buybacks.get(`${block}:${id}`) ?? zero
      const r = { a: after[id].a - before[id].a - sd.a, b: after[id].b - before[id].b - sd.b, s: after[id].s - before[id].s - sd.s }
      explained[id] = { a: explained[id].a + r.a, b: explained[id].b + r.b, s: explained[id].s + r.s }
      // share supply moved: public liquidity add or remove, not a swap
      if (r.s !== 0n) continue
      const swapA = r.a - bb.a
      const swapB = r.b - bb.b
      if (swapA === 0n && swapB === 0n) continue
      if ((swapA > 0n) === (swapB > 0n) || swapA === 0n || swapB === 0n) throw new Error(`tacit: one-sided reserve move without share change at block ${block} pool ${id}`)
      addSwap(out, info[id], assets, swapA, swapB, 0n)
    }
  }
  const [start, end] = [await stateAt(fromBlock - 1), await stateAt(toBlock)]
  for (const id of ids) {
    const total = { a: end[id].a - start[id].a, b: end[id].b - start[id].b, s: end[id].s - start[id].s }
    if (total.a !== explained[id].a || total.b !== explained[id].b || total.s !== explained[id].s) {
      throw new Error(`tacit: pool ${id} reserve change between blocks ${fromBlock - 1} and ${toBlock} is not explained by settles and public swaps`)
    }
  }
}

const fetch = async (options: FetchOptions) => {
  const out: Out = {
    dailyFees: options.createBalances(), dailyRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(), dailyVolume: options.createBalances(),
  }
  await addEvmPoolRelayFees(options, out)
  if (options.chain === CHAIN.ETHEREUM) {
    const { settles, undecodedBlocks } = await loadSettles(options)
    const feeAssets = await loadAssets(options, settles.flatMap((s) => s.pv.fees.map((f: any) => String(f.assetId))))
    addSettleRelayFees(out, settles, feeAssets)
    await addTips(options, out, settles)
    await addProvingFees(options, out)
    await addAmmSwaps(options, out, settles, undecodedBlocks)
  }
  return {
    dailyFees: out.dailyFees,
    dailyUserFees: out.dailyFees.clone(),
    dailyRevenue: out.dailyRevenue,
    dailyProtocolRevenue: out.dailyRevenue.clone(),
    dailySupplySideRevenue: out.dailySupplySideRevenue,
    dailyVolume: out.dailyVolume,
  }
}

const methodology = {
  Fees: 'Relay fees and tips users pay to have their private Tacit transactions proved and submitted, TAC paid through ProofMarket for proving, and swap fees on Tacit\'s own AMM pools. Excludes fees bound to settles that third parties submit for themselves.',
  UserFees: 'All relay fees, tips, proving fees and swap fees, paid directly by Tacit users.',
  Revenue: 'Relay fees, tips and proving fees collected by Tacit\'s own relay, keeper and splitter wallets. Gas and proving costs the relay pays are not deducted.',
  ProtocolRevenue: 'Relay fees, tips and proving fees collected by Tacit\'s own relay, keeper and splitter wallets, which the team operates. The 10% of relay income that buys back TAC stays inside protocol revenue because the bought TAC goes to the ops-multisig reserve.',
  SupplySideRevenue: 'Swap fees earned by Tacit AMM liquidity providers, plus relay fees paid to third-party relayers registered on the Tacit EVM pools.',
  Volume: 'Swaps on Tacit\'s own AMM: public swaps and private batch swaps at the net amount each one moves through the pool, which is a lower bound because opposite trades inside a private batch or a single block net out. Excludes deposits, withdrawals, liquidity changes, TacBuyback\'s own buys and swaps routed to outside venues.',
}

const breakdownMethodology = {
  Fees: {
    [LABEL.RELAY]: 'Fees users pay the relay that proves and submits their private transactions, taken from the shielded balance (ConfidentialPool settle fee payments and Tacit EVM pool relayer fees).',
    [LABEL.TIPS]: 'ETH tips users add when a relay settles their deposit into the Tacit pool, through the tip forwarders or the router.',
    [LABEL.PROVING]: 'TAC users pay through ProofMarket to have an operation proved and settled.',
    [LABEL.SWAP]: 'The pool fee (0.30%) on the input of each swap on Tacit\'s AMM pools.',
  },
  UserFees: {
    [LABEL.RELAY]: 'Relay fees paid by users from their shielded balance.',
    [LABEL.TIPS]: 'ETH tips paid by users for relayed deposits.',
    [LABEL.PROVING]: 'TAC paid by users for proving.',
    [LABEL.SWAP]: 'Swap fees paid by traders on Tacit\'s AMM pools.',
  },
  Revenue: {
    [LABEL.RELAY_TO_TACIT]: 'Relay fees collected by Tacit\'s settle wallets and EVM pool keepers.',
    [LABEL.TIPS_TO_TACIT]: 'Tips paid to Tacit\'s ops multisig, relay wallet or EthSplitter.',
    [LABEL.PROVING_TO_TACIT]: 'ProofMarket payments to Tacit\'s settle wallet acting as prover.',
  },
  ProtocolRevenue: {
    [LABEL.RELAY_TO_TACIT]: 'Relay fees collected by Tacit\'s settle wallets and EVM pool keepers.',
    [LABEL.TIPS_TO_TACIT]: 'Tips paid to Tacit\'s ops multisig, relay wallet or EthSplitter.',
    [LABEL.PROVING_TO_TACIT]: 'ProofMarket payments to Tacit\'s settle wallet acting as prover.',
  },
  SupplySideRevenue: {
    [LABEL.RELAY_TO_OTHERS]: 'Relayer fees paid to third-party relayers on the Tacit EVM pools.',
    [LABEL.TIPS_TO_OTHERS]: 'Tips paid to relays that are not Tacit\'s.',
    [LABEL.PROVING_TO_OTHERS]: 'ProofMarket payments to provers that are not Tacit\'s.',
    [LABEL.SWAP_TO_LPS]: 'Swap fees kept in the pool reserves for liquidity providers.',
    [LABEL.SWAP_TO_CREATORS]: 'The protocol-fee cut of swap fees paid to the creator of a protocol-fee pool.',
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
