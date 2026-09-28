import { Balances } from "@defillama/sdk";
import { ethers } from "ethers";
import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// The Goo Exchange app (https://goo.exchange) compares its own pools with outside aggregators and sends each trade to the
// best route. Two of those routes are tagged on-chain:
// - Nordstern pays the app's 0.1% interface fee to the Goo Exchange treasury in the same transaction as the trade. The fee
//   is taken from the trade's output (in WETH when the output is ETH).
// - KyberSwap writes the app's client id into each swap's ClientData event ("Source":"goo-exchange"). These routes carry no fee.
const NORDSTERN_GUARD = '0x603206D6105217DD972E4Ab30676A220CA393346' // Nordstern AggregatorGuard on Robinhood Chain (Sourcify exact match)
const TREASURY = '0xB50f029A7004f87B13CBCefb7f21c0A91CbD1bA0' // Goo Exchange treasury Safe, the interface fee recipient
const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5' // KyberSwap MetaAggregationRouterV2 on Robinhood Chain
const KYBER_SOURCE = '"Source":"goo-exchange"' // the client id the app sends KyberSwap since 2026-09-28
const GOO = '0x6572eade9fb17f4027baf92feac222b9aa746bd0' // no DefiLlama price yet, so its trades are valued by the other side
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const AGGREGATED_TRADE = 'event AggregatedTrade(uint16 indexed id, address indexed user, address tokenIn, address tokenOut, address executor, uint256 amountIn, uint256 amountOut, uint256 minAmountOut)'
const TRANSFER = 'event Transfer(address indexed from, address indexed to, uint256 value)'
const CLIENT_DATA = 'event ClientData(bytes clientData)'
const SWAPPED = 'event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)'

const INTERFACE_FEES = 'Interface Fees'
const INTERFACE_FEES_TO_TREASURY = 'Interface Fees To Treasury'

// native ETH legs settle in WETH, which is also the token their fee is paid in
const erc20 = (token: string) => token.toLowerCase() === NATIVE ? ADDRESSES.robinhood.WETH.toLowerCase() : token.toLowerCase()

type Leg = { token: string, amount: bigint, fee?: bigint }
type Totals = { dailyVolume: Balances, dailyFees: Balances }

// addOneToken books the first token when it is a core asset and the second otherwise, so GOO goes first
function addTrade(totals: Totals, input: Leg, output: Leg) {
  const [first, second] = output.token === GOO ? [output, input] : [input, output]
  addOneToken({ balances: totals.dailyVolume, token0: first.token, amount0: first.amount, token1: second.token, amount1: second.amount })
  if (first.fee !== undefined && second.fee !== undefined)
    addOneToken({ balances: totals.dailyFees, token0: first.token, amount0: first.fee, token1: second.token, amount1: second.fee, label: INTERFACE_FEES })
}

async function addKyberSwapRoutes(options: FetchOptions, totals: Totals) {
  const clientData = await options.getLogs({ target: KYBER_ROUTER, eventAbi: CLIENT_DATA, entireLog: true, parseLog: true })
  const appTxs = new Set(clientData
    .filter((log: any) => Buffer.from(log.args.clientData.slice(2), 'hex').toString('latin1').includes(KYBER_SOURCE))
    .map((log: any) => log.transactionHash.toLowerCase()))
  if (!appTxs.size) return

  const swaps = await options.getLogs({ target: KYBER_ROUTER, eventAbi: SWAPPED, entireLog: true, parseLog: true })
  for (const swap of swaps) {
    if (!appTxs.delete(swap.transactionHash.toLowerCase())) continue // one Swapped per tagged transaction
    const { srcToken, dstToken, spentAmount, returnAmount } = swap.args
    addTrade(totals, { token: erc20(srcToken), amount: BigInt(spentAmount) }, { token: erc20(dstToken), amount: BigInt(returnAmount) })
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  await addKyberSwapRoutes(options, { dailyVolume, dailyFees })

  const trades = await options.getLogs({ target: NORDSTERN_GUARD, eventAbi: AGGREGATED_TRADE, entireLog: true, parseLog: true })
  const tradesByTx: Record<string, any[]> = {}
  for (const trade of trades) (tradesByTx[trade.transactionHash.toLowerCase()] ??= []).push(trade)

  const feeTokens = [...new Set(trades.map((trade: any) => erc20(trade.args.tokenOut)))]
  const feeTransfers = feeTokens.length ? await options.getLogs({
    targets: feeTokens,
    eventAbi: TRANSFER,
    topics: [TRANSFER_TOPIC, null as any, ethers.zeroPadValue(TREASURY, 32)],
    entireLog: true,
    parseLog: true,
  }) : []

  const counted = new Set<string>()
  for (const transfer of feeTransfers) {
    const txHash = transfer.transactionHash.toLowerCase()
    const txTrades = tradesByTx[txHash]
    // a fee can only be matched to its trade when the transaction holds exactly one Nordstern trade
    if (txTrades?.length !== 1 || counted.has(txHash)) continue
    const { tokenIn, tokenOut, amountIn, amountOut } = txTrades[0].args
    if (transfer.address.toLowerCase() !== erc20(tokenOut)) continue
    counted.add(txHash)

    const fee = BigInt(transfer.args.value)
    const grossOut = BigInt(amountOut) + fee // amountOut is net of the fee
    addTrade({ dailyVolume, dailyFees },
      { token: erc20(tokenIn), amount: BigInt(amountIn), fee: BigInt(amountIn) * fee / grossOut },
      { token: erc20(tokenOut), amount: grossOut, fee })
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(1),
    dailyRevenue: dailyFees.clone(1, INTERFACE_FEES_TO_TREASURY),
    dailyProtocolRevenue: dailyFees.clone(1, INTERFACE_FEES_TO_TREASURY),
  }
}

const methodology = {
  Volume: "Swaps the Goo Exchange app routes through outside aggregators on Robinhood Chain. Nordstern routes: AggregatedTrade events whose transaction pays the app's interface fee to the Goo Exchange treasury (transactions holding more than one Nordstern trade are skipped). KyberSwap routes (from 2026-09-28): Swapped events whose transaction carries the app's client id in KyberSwap's ClientData. The app's LiquidSwap routes carry no on-chain tag and are not counted, and its own-pool route is DEX volume under Goo Exchange.",
  Fees: "The app's 0.1% interface fee on its Nordstern routes (Nordstern encodes it in 1/65536 steps, so 0.0992%), taken from each trade's output. Fees paid in GOO are valued at the trade's own price.",
  UserFees: "The app's 0.1% interface fee on its Nordstern routes, paid by the trader.",
  Revenue: "All interface fees go to the Goo Exchange treasury.",
  ProtocolRevenue: "All interface fees go to the Goo Exchange treasury.",
}

const breakdownMethodology = {
  Fees: { [INTERFACE_FEES]: methodology.Fees },
  UserFees: { [INTERFACE_FEES]: methodology.UserFees },
  Revenue: { [INTERFACE_FEES_TO_TREASURY]: methodology.Revenue },
  ProtocolRevenue: { [INTERFACE_FEES_TO_TREASURY]: methodology.ProtocolRevenue },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-27',
  methodology,
  breakdownMethodology,
  doublecounted: true, // Nordstern.Finance already counts these trades in its own volume
}

export default adapter
