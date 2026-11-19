import ADDRESSES from '../../helpers/coreAssets.json'
import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions } from "../../adapters/types";
import { getTransactionsWithRetry, getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";
import {
  ALLOWANCE_HOLDER,
  BIM_FEE_WALLET,
  BIM_FEE_WALLET_WORD,
  BIM_RPC_CHAINS,
  OPEN_ROUTER,
  REQUEST_EXECUTED_TOPIC,
} from "./config";

// What the Dune prefetch does, but against a chain's RPC, for the chains Dune does
// not index. bim txs are the OpenRouter txs (RequestExecuted) whose calldata pays
// bim's fee wallet. Unlike the Dune path the calldata is ABI-decoded, which also
// catches performActions routes that pay a native fee (the fee wallet is then packed
// into actionInfo, not a padded word, so the bimTxsCte word search misses them).
// Volume is the input token and amount of each tx, which for a swap is the input leg
// rather than Dune's dex.trades amount_usd - there is no RPC equivalent of that table.

// tx hashes per indexer request, a longer list overflows the request URL (414)
const INDEXER_HASH_BATCH = 50;

const openRouter = new ethers.Interface([
  'function swap(bytes32 quoteId, uint256 flags, (address user, address inputToken, uint256 inputAmount) input, (address receiver, uint256 amount) fee, (address target, address approvalSpender, address outputToken, uint256 value, uint256 minOutput, uint256 returnDataWordOffset) swapData, bytes swapCallData, address receiver)',
  'function bridge(bytes32 quoteId, (address user, address inputToken, uint256 inputAmount) input, (address receiver, uint256 amount) fee, (address target, address approvalSpender, uint256 value) bridgeData, bytes bridgeCallData)',
  'function swapAndBridge(bytes32 quoteId, uint256 flags, (address user, address inputToken, uint256 inputAmount) input, (address receiver, uint256 amount) fee, (address target, address approvalSpender, address outputToken, uint256 value, uint256 minOutput, uint256 returnDataWordOffset) swapData, bytes swapCallData, (address target, address approvalSpender, uint256 value) bridgeData, bytes bridgeCallData)',
  'function performActions(bytes32 quoteId, (uint256 actionInfo, bytes data, uint256[] splices)[] actions)',
]);
// AllowanceHolder has no verified ABI functions (fallback dispatch); 0x2213bc0b is
// 0x's AllowanceHolder.exec, which matches the token/amount/calldata layout of bim txs
const allowanceHolder = new ethers.Interface([
  'function exec(address operator, address token, uint256 amount, address target, bytes data)',
]);
const transferEvent = new ethers.Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);
const TRANSFER_TOPIC = transferEvent.getEvent('Transfer')!.topicHash;

export type BimTx = {
  hash: string
  // OpenRouter function selector, after unwrapping AllowanceHolder.exec
  selector: string
  // the token and amount the user hands over, undefined when the calldata does not
  // spell them out (performActions called directly with no native value)
  input?: { token: string, amount: bigint }
  // fee from the calldata, used for native fees which emit no Transfer log
  nativeFee: bigint
}

const normalizeToken = (token: string): string =>
  token.toLowerCase() === ADDRESSES.GAS_TOKEN_2 ? ADDRESSES.null : token.toLowerCase()

const isNative = (token: string) => normalizeToken(token) === ADDRESSES.null

const parseBimTx = (tx: any): BimTx | undefined => {
  const to = String(tx.to ?? '').toLowerCase()
  if (to !== ALLOWANCE_HOLDER && to !== OPEN_ROUTER) return
  let data = String(tx.data)
  let wrapped: { token: string, amount: bigint } | undefined
  if (to === ALLOWANCE_HOLDER) {
    const exec = allowanceHolder.parseTransaction({ data })
    if (!exec) return
    wrapped = { token: normalizeToken(exec.args.token), amount: exec.args.amount }
    data = exec.args.data
  }
  const call = openRouter.parseTransaction({ data })
  if (!call) return

  const value = BigInt(tx.value ?? 0)
  if (call.name === 'performActions') {
    // actionInfo packs the call target (top 160 bits) with 16 bits of flags. A native
    // fee is an action targeting the fee wallet whose data is the amount as a single
    // word. an ERC20 fee is a token transfer action, so the fee wallet word
    // sits in its calldata.
    let nativeFee = 0n
    let paysBim = false
    for (const action of call.args.actions) {
      const target = ethers.toBeHex(BigInt(action.actionInfo) >> 16n, 20).toLowerCase()
      if (target === BIM_FEE_WALLET) {
        if (ethers.dataLength(action.data) !== 32) throw new Error(`bim: unexpected fee action layout in ${tx.hash}`)
        paysBim = true
        nativeFee += BigInt(action.data)
      } else if (String(action.data).toLowerCase().includes(BIM_FEE_WALLET_WORD.slice(2))) paysBim = true
    }
    if (!paysBim) return
    const input = wrapped ?? (value > 0n ? { token: ADDRESSES.null, amount: value } : undefined)
    return { hash: String(tx.hash).toLowerCase(), selector: call.selector, input, nativeFee }
  }

  // swap, bridge, swapAndBridge: input struct sits right before the fee struct
  if (String(call.args.fee.receiver).toLowerCase() !== BIM_FEE_WALLET) return
  // the fee is taken from the input token, except on swapAndBridge where it is taken
  // from the swap output
  const feeToken = call.name === 'swapAndBridge' ? call.args.swapData.outputToken : call.args.input.inputToken
  return {
    hash: String(tx.hash).toLowerCase(),
    selector: call.selector,
    input: wrapped ?? { token: normalizeToken(call.args.input.inputToken), amount: call.args.input.inputAmount },
    nativeFee: isNative(feeToken) ? BigInt(call.args.fee.amount) : 0n,
  }
}

// The tx behind each hash: one indexer request per 50 hashes on indexed chains,
// otherwise one RPC call per hash (retried, as a lagging node answers null).
const getTransactions = async (options: FetchOptions, hashes: Array<string>): Promise<Array<any>> => {
  if (sdk.indexer.isIndexerEnabled(options.chain)) {
    try {
      const [from_block, to_block] = await Promise.all([options.getFromBlock(), options.getToBlock()])
      const txs: Array<any> = []
      for (let i = 0; i < hashes.length; i += INDEXER_HASH_BATCH)
        txs.push(...(await sdk.indexer.getTransactions({ chain: options.chain, transaction_hashes: hashes.slice(i, i + INDEXER_HASH_BATCH), from_block, to_block }) ?? []))
      if (txs.length === hashes.length) return txs
      console.error(`bim: indexer returned ${txs.length} of ${hashes.length} ${options.chain} txs, falling back to RPC`)
    } catch (e) {
      // the indexer trails the chain head, so the latest window can be out of its range
      console.error(`bim: indexer failed on ${options.chain}, falling back to RPC`, (e as any)?.message)
    }
  }
  return getTransactionsWithRetry(options.chain, hashes)
}

// Every bim tx on the new API emits RequestExecuted from OpenRouter, enters either
// directly or through AllowanceHolder.exec, and pays bim's fee wallet.
export const getBimTxs = async (options: FetchOptions): Promise<Array<BimTx>> => {
  const { maxBlockRange } = BIM_RPC_CHAINS[options.chain] ?? {}
  const logs = await options.getLogs({
    target: OPEN_ROUTER,
    topics: [REQUEST_EXECUTED_TOPIC],
    entireLog: true,
    onlyArgs: false,
    maxBlockRange,
  })
  const hashes = [...new Set(logs.map((log: any) => String(log.transactionHash).toLowerCase()))]
  if (!hashes.length) return []

  const txs = await getTransactions(options, hashes)
  if (txs.some((tx) => !tx)) throw new Error(`bim: no transaction found for a ${options.chain} RequestExecuted log`)
  return txs.map(parseBimTx).filter((tx): tx is BimTx => !!tx)
}

// Fees paid to bim's fee wallet by the given txs: ERC20 fees are the Transfer logs
// into the wallet, native fees come from the calldata as an internal native transfer
// emits no log.
const addBimFees = async (options: FetchOptions, txs: Array<BimTx>, dailyFees: any) => {
  const receipts = await getTxReceiptsWithRetry(options.chain, txs.map((tx) => tx.hash))
  if (receipts.some((receipt) => !receipt)) throw new Error(`bim: missing receipt for a ${options.chain} bim tx`)

  for (const receipt of receipts as Array<any>) {
    for (const log of receipt.logs) {
      if (log.topics[0] !== TRANSFER_TOPIC || log.topics[2]?.toLowerCase() !== BIM_FEE_WALLET_WORD) continue
      dailyFees.add(log.address.toLowerCase(), BigInt(log.data).toString())
    }
  }
  for (const tx of txs)
    if (tx.nativeFee > 0n) dailyFees.add(ADDRESSES.null, tx.nativeFee.toString())
}

// Volume and fees for one of the RPC-only chains, for the subset of bim txs whose
// OpenRouter selector is one of `selectors`.
export const fetchBimFromRpc = async (options: FetchOptions, selectors: Array<string>) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const txs = (await getBimTxs(options)).filter((tx) => selectors.includes(tx.selector))
  if (!txs.length) return { dailyVolume, dailyFees }

  for (const tx of txs)
    if (tx.input) dailyVolume.add(tx.input.token, tx.input.amount.toString())
  await addBimFees(options, txs, dailyFees)

  return { dailyVolume, dailyFees }
}
