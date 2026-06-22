import { ethers } from "ethers";
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { getTransactions } from "../../helpers/getTxReceipts";
import JAM_ABI from "./jamAbi";
import { queryDuneSql } from "../../helpers/dune"
import { CHAIN } from "../../helpers/chains"

/* ============================================================================
 * Bebop migrated its settlement contracts over time (legacy Settlement/JAM ->
 * current JAM + Blend/RFQ). Chains covered by the Dune `bebop.trades` table get
 * complete history from Dune (it spans every contract generation). Chains NOT
 * in that table (blast, mode, taiko, hyperliquid) are read on-chain instead.
 *
 * For the on-chain chains we run BOTH the legacy and the current contract logic
 * and sum the result: a given trade is settled by exactly one contract
 * generation, so the two paths never count the same trade. Legacy supplies the
 * pre-migration volume (e.g. ~$5.8M/day on blast in mid-2024) and current
 * supplies post-migration volume — dropping the legacy path would prune that
 * history on backfill.
 * ========================================================================== */

// ----------------------------------------------------------------------------
// Legacy settlement contracts (pre-migration)
// ----------------------------------------------------------------------------
const legacyAbis = {
  "AggregateOrderExecuted": "event AggregateOrderExecuted(bytes32 order_hash)",
  "OrderSignerRegistered": "event OrderSignerRegistered(address maker, address signer, bool allowed)",
  "AGGREGATED_ORDER_TYPE_HASH": "function AGGREGATED_ORDER_TYPE_HASH() view returns (bytes32)",
  "DOMAIN_SEPARATOR": "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "EIP712_DOMAIN_TYPEHASH": "function EIP712_DOMAIN_TYPEHASH() view returns (bytes32)",
  "PARTIAL_AGGREGATED_ORDER_TYPE_HASH": "function PARTIAL_AGGREGATED_ORDER_TYPE_HASH() view returns (bytes32)",
  "SettleAggregateOrder": "function SettleAggregateOrder((uint256 expiry, address taker_address, address[] maker_addresses, uint256[] maker_nonces, address[][] taker_tokens, address[][] maker_tokens, uint256[][] taker_amounts, uint256[][] maker_amounts, address receiver, bytes commands) order, (uint8 signatureType, bytes signatureBytes) takerSig, ((uint8 signatureType, bytes signatureBytes) signature, bool usingPermit2)[] makerSigs) payable returns (bool)",
  "SettleAggregateOrderWithTakerPermits": "function SettleAggregateOrderWithTakerPermits((uint256 expiry, address taker_address, address[] maker_addresses, uint256[] maker_nonces, address[][] taker_tokens, address[][] maker_tokens, uint256[][] taker_amounts, uint256[][] maker_amounts, address receiver, bytes commands) order, (uint8 signatureType, bytes signatureBytes) takerSig, ((uint8 signatureType, bytes signatureBytes) signature, bool usingPermit2)[] makerSigs, (bytes[] permitSignatures, bytes signatureBytesPermit2, uint48[] noncesPermit2, uint48 deadline) takerPermitsInfo) payable returns (bool)",
  "hashAggregateOrder": "function hashAggregateOrder((uint256 expiry, address taker_address, address[] maker_addresses, uint256[] maker_nonces, address[][] taker_tokens, address[][] maker_tokens, uint256[][] taker_amounts, uint256[][] maker_amounts, address receiver, bytes commands) order) view returns (bytes32)",
  "hashPartialOrder": "function hashPartialOrder((uint256 expiry, address taker_address, address maker_address, uint256 maker_nonce, address[] taker_tokens, address[] maker_tokens, uint256[] taker_amounts, uint256[] maker_amounts, address receiver, bytes commands) order) view returns (bytes32)",
  "Trade": "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)", // gnosis
  "swap": "function swap((bytes32 poolId, uint256 assetInIndex, uint256 assetOutIndex, uint256 amount, bytes userData)[] swaps, address[] tokens, (uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature) trade)", // gnosis
  "settle": "function settle(address[] tokens, uint256[] clearingPrices, (uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] trades, (address target, uint256 value, bytes callData)[][3] interactions)", // gnosis
  "sellOrderSwap": "function sellOrderSwap((uint256 deadline, address tokenIn, uint256 amountIn, uint256 nonce, bytes signature, address allowanceTarget, address swapper, bytes swapData, address tokenOut, uint256 minAmountOut, (address recipient, uint256 shareBps)[] transferOut) _params) payable returns (uint256 _amountIn, uint256 _amountOut)",

  // maestro
  "swapAndDeposit": "function swapAndDeposit(address tokenToSell, address tokenToDeposit, (address router, address spender, uint256 amountIn, uint256 minAmountOut, bytes swapBytes) swapData) returns (uint256)",
  "swapAndDepositNative": "function swapAndDepositNative(address tokenToDeposit, (address router, address spender, uint256 amountIn, uint256 minAmountOut, bytes swapBytes) swapData) payable returns (uint256)",
  "swapAndDepositWithPermit": "function swapAndDepositWithPermit(address tokenToSell, address tokenToDeposit, (address router, address spender, uint256 amountIn, uint256 minAmountOut, bytes swapBytes) swapData, (uint256 amount, uint256 deadline, bytes32 r, bytes32 vs) permit) returns (uint256)",
  "swapAndDepositWithPermit2": "function swapAndDepositWithPermit2(address tokenToSell, address tokenToDeposit, (address router, address spender, uint256 amountIn, uint256 minAmountOut, bytes swapBytes) swapData, (uint256 amount, uint256 deadline, bytes32 r, bytes32 vs) permit) returns (uint256)",
  "swapAndWithdraw": "function swapAndWithdraw(address tokenToSell, address tokenToReceive, (address router, address spender, uint256 amountIn, uint256 minAmountOut, bytes swapBytes) swapData, address to) returns (uint256)",
  "swapAndWithdrawNative": "function swapAndWithdrawNative(address tokenToSell, (address router, address spender, uint256 amountIn, uint256 minAmountOut, bytes swapBytes) swapData, address to) returns (uint256 output)",
  "trade": "function trade((bytes32 positionId, int256 quantity, uint256 limitPrice, uint8 cashflowCcy, int256 cashflow) tradeParams, (address spender, address router, uint256 swapAmount, bytes swapBytes, address flashLoanProvider) execParams) returns (bytes32, (int256 quantity, (uint8 inputCcy, int256 input, int256 output, uint256 price) swap, uint8 cashflowCcy, int256 cashflow, uint256 fee, uint8 feeCcy, uint256 forwardPrice))",
  "tradeAndLinkedOrder": "function tradeAndLinkedOrder((bytes32 positionId, int256 quantity, uint256 limitPrice, uint8 cashflowCcy, int256 cashflow) tradeParams, (address spender, address router, uint256 swapAmount, bytes swapBytes, address flashLoanProvider) execParams, (uint128 limitPrice, uint128 tolerance, uint8 cashflowCcy, uint32 deadline, uint8 orderType) linkedOrderParams) payable returns (bytes32 positionId, (int256 quantity, (uint8 inputCcy, int256 input, int256 output, uint256 price) swap, uint8 cashflowCcy, int256 cashflow, uint256 fee, uint8 feeCcy, uint256 forwardPrice) trade_, bytes32 linkedOrderId)",
  "tradeAndLinkedOrders": "function tradeAndLinkedOrders((bytes32 positionId, int256 quantity, uint256 limitPrice, uint8 cashflowCcy, int256 cashflow) tradeParams, (address spender, address router, uint256 swapAmount, bytes swapBytes, address flashLoanProvider) execParams, (uint128 limitPrice, uint128 tolerance, uint8 cashflowCcy, uint32 deadline, uint8 orderType) linkedOrderParams1, (uint128 limitPrice, uint128 tolerance, uint8 cashflowCcy, uint32 deadline, uint8 orderType) linkedOrderParams2) payable returns (bytes32 positionId, (int256 quantity, (uint8 inputCcy, int256 input, int256 output, uint256 price) swap, uint8 cashflowCcy, int256 cashflow, uint256 fee, uint8 feeCcy, uint256 forwardPrice) trade_, bytes32 linkedOrderId1, bytes32 linkedOrderId2)",
  "tradeAndWithdraw": "function tradeAndWithdraw((bytes32 positionId, int256 quantity, uint256 limitPrice, uint8 cashflowCcy, int256 cashflow) tradeParams, (address spender, address router, uint256 swapAmount, bytes swapBytes, address flashLoanProvider) execParams, address to) returns (bytes32 positionId, (int256 quantity, (uint8 inputCcy, int256 input, int256 output, uint256 price) swap, uint8 cashflowCcy, int256 cashflow, uint256 fee, uint8 feeCcy, uint256 forwardPrice) trade_, uint256 amount)",
  "tradeAndWithdrawNative": "function tradeAndWithdrawNative((bytes32 positionId, int256 quantity, uint256 limitPrice, uint8 cashflowCcy, int256 cashflow) tradeParams, (address spender, address router, uint256 swapAmount, bytes swapBytes, address flashLoanProvider) execParams, address to) returns (bytes32 positionId, (int256 quantity, (uint8 inputCcy, int256 input, int256 output, uint256 price) swap, uint8 cashflowCcy, int256 cashflow, uint256 fee, uint8 feeCcy, uint256 forwardPrice) trade_, uint256 amount)",
}
const legacyInterface = new ethers.Interface(Object.values(legacyAbis));
const LEGACY_RFQ = '0xBeB09000fa59627dc02Bb55448AC1893EAa501A5'
const LEGACY_JAM = new ethers.Contract('0xbebebeb035351f58602e0c1c8b59ecbff5d5f47b', JAM_ABI)
const legacyJamAddress: any = {
  [CHAIN.ERA]: '0x574d1fcF950eb48b11de5DF22A007703cbD2b129',
  default: '0xbebebeb035351f58602e0c1c8b59ecbff5d5f47b',
}

// Pre-migration volume: legacy aggregation contract + legacy JAM settlement.
const addLegacyVolume = async (dailyVolume: any, { getLogs, chain, api }: FetchOptions) => {
  const cowswapData: any = {}
  const logs = await getLogs({
    target: LEGACY_RFQ,
    topics: ['0xc59522161f93d59c8c4520b0e7a3635fb7544133275be812a4ea970f4f14251b'], // AggregateOrderExecuted
  });
  if (chain === CHAIN.ETHEREUM) {
    const cowswapLogs = await getLogs({
      target: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
      eventAbi: legacyAbis.Trade,
      onlyArgs: false,
      entireLog: true,
    });
    cowswapLogs.forEach((log: any) => {
      cowswapData[log.transactionHash.toLowerCase()] = legacyInterface.parseLog(log)?.args
    })
  }
  const data: any = await getTransactions(chain, logs.map((log: any) => log.transactionHash), { cacheKey: 'bebop' })
  for (const d of data) {
    if (!d) continue;
    const decoded = legacyInterface.parseTransaction(d)
    if (!decoded) {
      api.log('legacy no decoded', d.hash, d.input.slice(0, 10), d.to, chain)
      continue;
    }
    if (decoded.args.order) {
      const { order: { taker_tokens, taker_amounts } } = decoded.args as any
      dailyVolume.add(taker_tokens.flat(), taker_amounts.flat())
    } else if (cowswapData[d.hash.toLowerCase()]) {
      const { buyToken, buyAmount } = cowswapData[d.hash.toLowerCase()]
      dailyVolume.add(buyToken, buyAmount)
    } else if (decoded.args._params?.minAmountOut) {
      const { tokenIn, amountIn } = decoded.args._params as any
      dailyVolume.add(tokenIn, amountIn)
    } else {
      api.log('legacy no order', d.hash, d.input.slice(0, 10), d.to, chain, decoded.signature)
    }
  }

  const jamLogs = await getLogs({
    target: legacyJamAddress[chain] || legacyJamAddress.default,
    topics: ['0x7a70845dec8dc098eecb16e760b0c1569874487f0459ae689c738e281b28ed38'], // Settlement
  });
  const jamData: any = await getTransactions(chain, jamLogs.map((log: any) => log.transactionHash), { cacheKey: 'bebop' })
  for (const d of jamData) {
    if (!d) continue;
    const decoded = LEGACY_JAM.interface.parseTransaction(d)
    if (!decoded) {
      api.log('legacy jam no decoded', d.hash, d.input.slice(0, 10), d.to, chain)
      continue;
    }
    const { buyAmounts = [], sellAmounts = [], buyTokens = [], sellTokens = [] } = decoded?.args?.order
    buyAmounts?.forEach((amount: any, i: number) => {
      dailyVolume.add(buyTokens[i], amount)
    })
    sellAmounts?.forEach((amount: any, i: number) => {
      dailyVolume.add(sellTokens[i], amount)
    })
  }
}

// ----------------------------------------------------------------------------
// Current settlement contracts (post-migration): JAM + Blend/RFQ
// ----------------------------------------------------------------------------
const JAM_SETTLEMENT = '0xbeb0b0623f66bE8cE162EbDfA2ec543A522F4ea6'
const RFQ_SETTLEMENT = '0xbbbbbBB520d69a9775E85b458C58c648259FAD5F'

const SINGLE_ORDER = '(uint256 expiry, address taker_address, address maker_address, uint256 maker_nonce, address taker_token, address maker_token, uint256 taker_amount, uint256 maker_amount, address receiver, uint256 packed_commands, uint256 flags)'
const MULTI_ORDER = '(uint256 expiry, address taker_address, address maker_address, uint256 maker_nonce, address[] taker_tokens, address[] maker_tokens, uint256[] taker_amounts, uint256[] maker_amounts, address receiver, bytes commands, uint256 flags)'
const AGG_ORDER = '(uint256 expiry, address taker_address, address[] maker_addresses, uint256[] maker_nonces, address[][] taker_tokens, address[][] maker_tokens, uint256[][] taker_amounts, uint256[][] maker_amounts, address receiver, bytes commands, uint256 flags)'
const MAKER_SIG = '(bytes signatureBytes, uint256 flags)'
const OLD_SINGLE_Q = '(bool useOldAmount, uint256 makerAmount, uint256 makerNonce)'
const OLD_MULTI_Q = '(bool useOldAmount, uint256[] makerAmounts, uint256 makerNonce)'
const OLD_AGG_Q = '(bool useOldAmount, uint256[][] makerAmounts, uint256[] makerNonces)'
const PERMIT_SIG = '(bytes signatureBytes, uint256 deadline)'
const PERMIT2_SIG = '(bytes signatureBytes, uint48 deadline, uint48 nonce)'
const MULTI_PERMIT2 = '(bytes signatureBytes, uint48 deadline, uint48[] nonces)'

const rfqInterface = new ethers.Interface([
  // settle* variants (with takerQuoteInfo + takerSignature)
  `function settleSingle(${SINGLE_ORDER} order, ${MAKER_SIG} makerSignature, uint256 filledTakerAmount, ${OLD_SINGLE_Q} takerQuoteInfo, bytes takerSignature) payable`,
  `function settleSingleAndSignPermit(${SINGLE_ORDER} order, ${MAKER_SIG} makerSignature, uint256 filledTakerAmount, ${OLD_SINGLE_Q} takerQuoteInfo, bytes takerSignature, ${PERMIT_SIG} takerPermitSignature) payable`,
  `function settleSingleAndSignPermit2(${SINGLE_ORDER} order, ${MAKER_SIG} makerSignature, uint256 filledTakerAmount, ${OLD_SINGLE_Q} takerQuoteInfo, bytes takerSignature, ${PERMIT2_SIG} takerPermit2Signature) payable`,
  `function settleMulti(${MULTI_ORDER} order, ${MAKER_SIG} makerSignature, uint256 filledTakerAmount, ${OLD_MULTI_Q} takerQuoteInfo, bytes takerSignature) payable`,
  `function settleMultiAndSignPermit(${MULTI_ORDER} order, ${MAKER_SIG} makerSignature, uint256 filledTakerAmount, ${OLD_MULTI_Q} takerQuoteInfo, bytes takerSignature, ${PERMIT_SIG} takerPermitSignature) payable`,
  `function settleMultiAndSignPermit2(${MULTI_ORDER} order, ${MAKER_SIG} makerSignature, uint256 filledTakerAmount, ${OLD_MULTI_Q} takerQuoteInfo, bytes takerSignature, ${MULTI_PERMIT2} infoPermit2) payable`,
  `function settleAggregate(${AGG_ORDER} order, ${MAKER_SIG}[] makersSignatures, uint256 filledTakerAmount, ${OLD_AGG_Q} takerQuoteInfo, bytes takerSignature) payable`,
  `function settleAggregateAndSignPermit(${AGG_ORDER} order, ${MAKER_SIG}[] makersSignatures, uint256 filledTakerAmount, ${OLD_AGG_Q} takerQuoteInfo, bytes takerSignature, ${PERMIT_SIG} takerPermitSignature) payable`,
  `function settleAggregateAndSignPermit2(${AGG_ORDER} order, ${MAKER_SIG}[] makersSignatures, uint256 filledTakerAmount, ${OLD_AGG_Q} takerQuoteInfo, bytes takerSignature, ${MULTI_PERMIT2} infoPermit2) payable`,
  // swap* variants (simpler — no takerQuoteInfo/takerSignature)
  `function swapSingle(${SINGLE_ORDER} order, ${MAKER_SIG} makerSignature, uint256 filledTakerAmount) payable`,
  `function swapSingleFromContract(${SINGLE_ORDER} order, ${MAKER_SIG} makerSignature) payable`,
  `function swapMulti(${MULTI_ORDER} order, ${MAKER_SIG} makerSignature, uint256 filledTakerAmount) payable`,
  `function swapAggregate(${AGG_ORDER} order, ${MAKER_SIG}[] makersSignatures, uint256 filledTakerAmount) payable`,
])

// Post-migration volume: JAM events (carry amounts) + Blend/RFQ calldata decode.
const addCurrentVolume = async (dailyVolume: any, { getLogs, chain, api }: FetchOptions) => {
  // JAM settlement — data is in events directly, no tx decoding needed
  const [jamLogs, blendSingleLogs, blendMultiLogs, blendAggregateLogs] = await Promise.all([
    getLogs({
      target: JAM_SETTLEMENT,
      eventAbi: 'event BebopJamOrderFilled(uint256 indexed nonce, address indexed user, address[] sellTokens, address[] buyTokens, uint256[] sellAmounts, uint256[] buyAmounts)',
      onlyArgs: true,
    }),
    getLogs({
      target: JAM_SETTLEMENT,
      eventAbi: 'event BebopBlendSingleOrderFilled(uint128 indexed eventId, address indexed receiver, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount)',
      onlyArgs: true,
    }),
    getLogs({
      target: JAM_SETTLEMENT,
      eventAbi: 'event BebopBlendMultiOrderFilled(uint128 indexed eventId, address indexed receiver, address[] sellTokens, address[] buyTokens, uint256[] sellAmounts, uint256[] buyAmounts)',
      onlyArgs: true,
    }),
    getLogs({
      target: JAM_SETTLEMENT,
      eventAbi: 'event BebopBlendAggregateOrderFilled(uint128 indexed eventId, address indexed receiver, address[] sellTokens, address[] buyTokens, uint256[] sellAmounts, uint256[] buyAmounts)',
      onlyArgs: true,
    }),
  ])

  for (const log of jamLogs) {
    dailyVolume.add(log.sellTokens, log.sellAmounts)
  }
  for (const log of blendSingleLogs) {
    dailyVolume.add(log.sellToken, log.sellAmount)
  }
  // Multi and Aggregate Blend events share the same array shape
  for (const log of [...blendMultiLogs, ...blendAggregateLogs]) {
    dailyVolume.add(log.sellTokens, log.sellAmounts)
  }

  // RFQ settlement — BebopOrder event has no amounts, must decode calldata
  const rfqLogs = await getLogs({
    target: RFQ_SETTLEMENT,
    topics: ['0xadd7095becdaa725f0f33243630938c861b0bba83dfd217d4055701aa768ec2e'], // BebopOrder(uint128)
  })

  // A single tx can emit several BebopOrder events; dedupe so each settlement
  // tx's calldata is decoded (and its volume counted) only once.
  const rfqTxHashes = [...new Set(rfqLogs.map((log: any) => log.transactionHash))]
  const rfqTxs: any[] = await getTransactions(chain, rfqTxHashes, { cacheKey: 'bebop-rfq' })
  for (const tx of rfqTxs) {
    if (!tx) continue
    // Only count txs that call the RFQ contract directly. Orders routed through
    // an aggregator (e.g. CoW Protocol) or through JAM's BebopBlend integration
    // also emit BebopOrder, but their top-level calldata is the aggregator/JAM
    // function — counting them here would either be undecodable or double-count
    // the JAM Blend events already handled above.
    if (tx.to?.toLowerCase() !== RFQ_SETTLEMENT.toLowerCase()) continue
    const decoded = rfqInterface.parseTransaction(tx)
    if (!decoded) {
      api.log('rfq no decoded', tx.hash, tx.input.slice(0, 10), chain)
      continue
    }
    const { order } = decoded.args
    const name = decoded.name
    if (name.includes('Single')) {
      dailyVolume.add(order.taker_token, order.taker_amount)
    } else if (name.includes('Multi')) {
      dailyVolume.add(order.taker_tokens, order.taker_amounts)
    } else if (name.includes('Aggregate')) {
      dailyVolume.add((order.taker_tokens as any[][]).flat(), (order.taker_amounts as any[][]).flat())
    } else {
      api.log('rfq unmatched function name', tx.hash, name, chain)
    }
  }
}

// On-chain fetch (chains not covered by Dune): sum legacy + current contracts.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  await addLegacyVolume(dailyVolume, options)
  await addCurrentVolume(dailyVolume, options)
  return { dailyVolume }
};

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
    SELECT
      blockchain,
      SUM(amount_usd) AS vol
    FROM bebop.trades
    WHERE block_time >= from_unixtime(${options.startTimestamp})
    AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY blockchain
  `);
};

// Dune's `bebop.trades` labels some chains differently from our repo chain ids.
const DUNE_CHAIN: Record<string, string> = {
  [CHAIN.BSC]: 'bnb',
  [CHAIN.ERA]: 'zksync',
}

async function fetchDune(options: FetchOptions) {
  const results = options.preFetchedResults || [];
  const duneChain = (DUNE_CHAIN[options.chain] || options.chain).toLowerCase();
  const chainData = results.find((item: any) => item.blockchain.toLowerCase() === duneChain);
  return { dailyVolume: chainData ? chainData.vol : 0 };
}

const adapter: Adapter = {
  version: 1,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  adapter: {
    // Covered by Dune `bebop.trades` (spans every contract generation)
    [CHAIN.ARBITRUM]:    { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.ETHEREUM]:    { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.POLYGON]:     { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.BSC]:         { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.OPTIMISM]:    { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.BASE]:        { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.ERA]:         { fetch: fetchDune, start: '2023-05-31', deadFrom: '2026-06-04' },
    [CHAIN.SCROLL]:      { fetch: fetchDune, start: '2023-05-31', deadFrom: '2026-06-04' },
    // Not in Dune — read on-chain (legacy + current contracts)
    [CHAIN.HYPERLIQUID]: { fetch,            start: '2025-04-28' },
    [CHAIN.BLAST]:       { fetch,            start: '2023-05-31', deadFrom: '2026-06-04' },
    [CHAIN.MODE]:        { fetch,            start: '2023-05-31', deadFrom: '2026-06-04' },
    [CHAIN.TAIKO]:       { fetch,            start: '2023-05-31', deadFrom: '2026-06-04' },
  },
  prefetch,
};

export default adapter;
