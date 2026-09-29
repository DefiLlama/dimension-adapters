import { ethers } from "ethers";
import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// The Goo Exchange app (https://goo.exchange) compares its own pools with outside aggregators and sends each trade to the
// best route. Its Nordstern routes are the ones that can be verified on-chain: Nordstern's executor pays the app's 0.1%
// interface fee to the Goo Exchange treasury in the same transaction as the trade, taken from the trade's output (in WETH
// when the output is ETH).
const NORDSTERN_GUARD = '0x603206D6105217DD972E4Ab30676A220CA393346' // Nordstern AggregatorGuard on Robinhood Chain (Sourcify exact match)
const TREASURY = '0xB50f029A7004f87B13CBCefb7f21c0A91CbD1bA0' // Goo Exchange treasury Safe, the interface fee recipient
const GOO = '0x6572eade9fb17f4027baf92feac222b9aa746bd0' // no DefiLlama price yet, so its trades are valued by the other side
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const MAX_FEE_PERCENT = 1n // the app's fee is 0.1%; a larger transfer to the treasury is not an interface fee
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const AGGREGATED_TRADE = 'event AggregatedTrade(uint16 indexed id, address indexed user, address tokenIn, address tokenOut, address executor, uint256 amountIn, uint256 amountOut, uint256 minAmountOut)'
const TRANSFER = 'event Transfer(address indexed from, address indexed to, uint256 value)'

const INTERFACE_FEES = 'Interface Fees'
const INTERFACE_FEES_TO_TREASURY = 'Interface Fees To Treasury'

// native ETH legs settle in WETH, which is also the token their fee is paid in
const erc20 = (token: string) => token.toLowerCase() === NATIVE ? ADDRESSES.robinhood.WETH.toLowerCase() : token.toLowerCase()

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

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
    const { tokenIn, tokenOut, executor, amountIn, amountOut } = txTrades[0].args
    // the interface fee is paid in the trade's output token, by the executor that ran the trade
    if (transfer.address.toLowerCase() !== erc20(tokenOut) || transfer.args.from.toLowerCase() !== executor.toLowerCase()) continue
    const fee = BigInt(transfer.args.value)
    const grossOut = BigInt(amountOut) + fee // amountOut is net of the fee
    if (fee === 0n || fee * 100n > grossOut * MAX_FEE_PERCENT) continue
    counted.add(txHash)

    const input = { token: erc20(tokenIn), amount: BigInt(amountIn), fee: BigInt(amountIn) * fee / grossOut }
    const output = { token: erc20(tokenOut), amount: grossOut, fee }
    // addOneToken books the first token when it is a core asset and the second otherwise, so GOO goes first
    const [first, second] = output.token === GOO ? [output, input] : [input, output]
    addOneToken({ balances: dailyVolume, token0: first.token, amount0: first.amount, token1: second.token, amount1: second.amount })
    addOneToken({ balances: dailyFees, token0: first.token, amount0: first.fee, token1: second.token, amount1: second.fee, label: INTERFACE_FEES })
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
  Volume: "Swaps the Goo Exchange app routes through Nordstern on Robinhood Chain: Nordstern AggregatedTrade events whose transaction also carries the app's interface fee, paid by the trade's executor to the Goo Exchange treasury in the trade's output token. Transactions holding more than one Nordstern trade are skipped. The app's other outside routes (KyberSwap, LiquidSwap) can't be verified on-chain and are not counted; its own-pool route is DEX volume under Goo Exchange.",
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
