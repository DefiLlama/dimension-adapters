import { ethers } from "ethers";
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { getTransactions } from "../../helpers/getTxReceipts";
import { queryDuneSql } from "../../helpers/dune"
import { CHAIN } from "../../helpers/chains"

const RFQ_SETTLEMENT = '0xbbbbbBB520d69a9775E85b458C58c648259FAD5F'

// JAM settlement uses one deterministic address on every EVM chain except zkSync
// Era, which has a separate deployment.
const JAM_SETTLEMENT: Record<string, string> = {
  [CHAIN.ERA]: '0x574d1fcF950eb48b11de5DF22A007703cbD2b129',
  default: '0xbeb0b0623f66bE8cE162EbDfA2ec543A522F4ea6',
}

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

const fetch = async (_: any, _1: any, { createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyVolume = createBalances()
  const jamSettlement = JAM_SETTLEMENT[chain] || JAM_SETTLEMENT.default

  // JAM settlement — data is in events directly, no tx decoding needed
  const [jamLogs, blendSingleLogs, blendMultiLogs, blendAggregateLogs] = await Promise.all([
    getLogs({
      target: jamSettlement,
      eventAbi: 'event BebopJamOrderFilled(uint256 indexed nonce, address indexed user, address[] sellTokens, address[] buyTokens, uint256[] sellAmounts, uint256[] buyAmounts)',
      onlyArgs: true,
    }),
    getLogs({
      target: jamSettlement,
      eventAbi: 'event BebopBlendSingleOrderFilled(uint128 indexed eventId, address indexed receiver, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount)',
      onlyArgs: true,
    }),
    getLogs({
      target: jamSettlement,
      eventAbi: 'event BebopBlendMultiOrderFilled(uint128 indexed eventId, address indexed receiver, address[] sellTokens, address[] buyTokens, uint256[] sellAmounts, uint256[] buyAmounts)',
      onlyArgs: true,
    }),
    getLogs({
      target: jamSettlement,
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
    }
  }

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

async function fetchDune(_: any, _1: any, options: FetchOptions) {
  const results = options.preFetchedResults || [];
  const chainData = results.find((item: any) => item.blockchain.toLowerCase() === options.chain.toLowerCase());
  return { dailyVolume: chainData ? chainData.vol : 0 };
}

const adapter: Adapter = {
  version: 1,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.ARBITRUM]:    { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.ETHEREUM]:    { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.POLYGON]:     { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.BSC]:         { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.OPTIMISM]:    { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.BASE]:        { fetch: fetchDune, start: '2023-05-31' },
    [CHAIN.HYPERLIQUID]: { fetch,            start: '2025-04-28' },
    [CHAIN.BLAST]:       { fetch,            start: '2023-05-31', deadFrom: '2026-06-04' },
    [CHAIN.ERA]:         { fetch,            start: '2023-05-31', deadFrom: '2026-06-04' },
    [CHAIN.MODE]:        { fetch,            start: '2023-05-31', deadFrom: '2026-06-04' },
    [CHAIN.SCROLL]:      { fetch: fetchDune, start: '2023-05-31', deadFrom: '2026-06-04' },
    [CHAIN.TAIKO]:       { fetch,            start: '2023-05-31', deadFrom: '2026-06-04' },
  },
  prefetch,
};

export default adapter;
