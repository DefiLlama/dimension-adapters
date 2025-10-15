import { ethers } from "ethers";
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { getTransactions } from "../../helpers/getTxReceipts";
import JAM_ABI from "./jamAbi";
import {queryDuneSql} from "../../helpers/dune"

const abis = {
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
const contract_interface = new ethers.Interface(Object.values(abis));

const JamContract = new ethers.Contract('0xbebebeb035351f58602e0c1c8b59ecbff5d5f47b', JAM_ABI)
const jamAddress: any = {
  era:'0x574d1fcF950eb48b11de5DF22A007703cbD2b129',
  default: '0xbebebeb035351f58602e0c1c8b59ecbff5d5f47b'
}


const fetch = async (_:any, _1:any, { createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyVolume = createBalances()
  const cowswapData: any = {}
  const logs = await getLogs({
    target: '0xBeB09000fa59627dc02Bb55448AC1893EAa501A5',
    topics: ['0xc59522161f93d59c8c4520b0e7a3635fb7544133275be812a4ea970f4f14251b'] // AggregateOrderExecuted
  });
  if (chain === 'ethereum') {
    const cowswapLogs = await getLogs({
      target: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
      eventAbi: abis.Trade,
      onlyArgs: false,
      entireLog: true,
    });
    cowswapLogs.forEach((log: any) => {
      cowswapData[log.transactionHash.toLowerCase()] = contract_interface.parseLog(log)?.args
    })
  }
  const data: any = await getTransactions(chain, logs.map((log: any) => log.transactionHash), { cacheKey: 'bebop' })
  for (const d of data) {
    if (!d) continue;
    const decoded = contract_interface.parseTransaction(d)
    if (!decoded) {
      api.log('no decoded', d.hash, d.input.slice(0, 10), d.to, chain)
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
      api.log('no order', d.hash, d.input.slice(0, 10), d.to, chain, decoded.signature)
    }
  }

  const jamLogs = await getLogs({
    target: jamAddress[chain] || jamAddress.default,
    topics: ['0x7a70845dec8dc098eecb16e760b0c1569874487f0459ae689c738e281b28ed38'] // Settlement,
  });

  const jamData: any = await getTransactions(chain, jamLogs.map((log: any) => log.transactionHash), { cacheKey: 'bebop' })
  for (const d of jamData) {
    if (!d) continue;
    const decoded = JamContract.interface.parseTransaction(d)
    if (!decoded) {
      api.log('jam no decoded', d.hash, d.input.slice(0, 10), d.to, chain)
      continue;
    }
    const {buyAmounts = [], sellAmounts = [], buyTokens = [], sellTokens = []} = decoded?.args?.order  
    buyAmounts?.forEach((amount: any, i: number) => {
      dailyVolume.add(buyTokens[i], amount)
    })
    sellAmounts?.forEach((amount: any, i: number) => {
      dailyVolume.add(sellTokens[i], amount)
    })
  }

  return { dailyVolume }
};

// Prefetch function that will run once before any fetch calls
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

async function fetchDune(_:any, _1:any, options: FetchOptions){
  const results = options.preFetchedResults || [];
  const chainData = results.find((item: any) => item.blockchain.toLowerCase() === options.chain.toLowerCase());
  // volume can be null
  let dailyVolume = 0
  if (chainData) {
    dailyVolume = chainData.vol;
  }

  return { dailyVolume };
}

const adapter: Adapter = {
  version: 1,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  adapter: {
    arbitrum: { fetch: fetchDune, start: '2023-05-31', },
    ethereum: { fetch: fetchDune, start: '2023-05-31', },
    polygon: { fetch: fetchDune, start: '2023-05-31', },
    bsc: { fetch: fetchDune, start: '2023-05-31', },
    blast: { fetch, start: '2023-05-31', },
    era: { fetch, start: '2023-05-31', },
    optimism: { fetch: fetchDune, start: '2023-05-31', },
    mode: { fetch, start: '2023-05-31', },
    base: { fetch: fetchDune, start: '2023-05-31', },
    scroll: { fetch: fetchDune, start: '2023-05-31', },
    taiko: { fetch, start: '2023-05-31', },
  },
  prefetch: prefetch,
};

export default adapter;
