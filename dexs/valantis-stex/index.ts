import { Balances } from '@defillama/sdk';
import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, IJSON, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { addOneToken } from '../../helpers/prices';
import { filterPools } from "../../helpers/uniswap"
import { METRIC } from '../../helpers/metrics';

const factory = "0x7E028ac56cB2AF75292F3D967978189698C24732"
const poolCreated = "event SovereignPoolDeployed(address indexed token0, address indexed token1, address pool)"
const swapEvent = "event Swap(address indexed sender, bool isZeroToOne, uint256 amountIn, uint256 fee, uint256 amountOut)"
const withdrawEvent = "event Withdraw(address indexed sender, address indexed recipient, uint256 amountToken0, uint256 amountToken1, uint256 shares)"
const poolWithdrawEvent = "event WithdrawLiquidity(address indexed recipient, uint256 amount0, uint256 amount1)"
const lendingWithdrawEvent = "event AmountWithdrawnFromLendingModule(uint256 amount)"
const BPS = 10000n

// STEX AMM => its sovereign pool (token1 is WHYPE in both)
// https://github.com/ValantisLabs/valantis-stex/blob/main/src/STEXAMM.sol
const stexPools: IJSON<string> = {
    "0x39694eff3b02248929120c73f90347013aec834d": "0x5365b6ef09253c7abc0a9286ec578a9f4b413b7d", // stHYPE
    "0xbf747d2959f03332dbd25249db6f00f62c6cb526": "0x88b214ec94276b825e641820d5c97a9042f9dd60", // kHYPE
}

// An instant STEX withdrawal sells the LP's LST share to the pool at a discount. The pool manager's cut of
// that spread stays in the STEX contract, so per tx it is the WHYPE the STEX pulled from the pool and the
// lending module minus the WHYPE paid to the LP (Withdraw.amountToken1); regular withdrawals net to 0.
async function addInstantWithdrawalFees(options: FetchOptions, dailyFees: Balances, dailyRevenue: Balances, dailySupplySideRevenue: Balances) {
    const withdrawals = await options.getLogs({ targets: Object.keys(stexPools), eventAbi: withdrawEvent, onlyArgs: false })
    const stexes = [...new Set(withdrawals.map(log => log.address.toLowerCase()))]
    if (!stexes.length) return
    const pools = stexes.map(stex => stexPools[stex])
    const modules = await options.api.multiCall({ calls: stexes, abi: "address:withdrawalModule" })
    const managerFeeBips = await options.api.multiCall({ calls: pools, abi: "uint256:poolManagerFeeBips" })
    const poolPayouts = await options.getLogs({ targets: pools, eventAbi: poolWithdrawEvent, onlyArgs: false })
    const lendingPayouts = await options.getLogs({ targets: modules, eventAbi: lendingWithdrawEvent, onlyArgs: false })

    const txs: IJSON<{ managerFee: bigint, bps: bigint }> = {}
    for (const log of withdrawals) {
        const bps = BigInt(managerFeeBips[stexes.indexOf(log.address.toLowerCase())])
        txs[log.transactionHash] ??= { managerFee: 0n, bps }
        txs[log.transactionHash].managerFee -= BigInt(log.args.amountToken1)
    }
    // the pool also pays the withdrawal module (unstake/supply flows), only payouts to the STEX fund a withdrawal
    for (const log of poolPayouts)
        if (txs[log.transactionHash] && stexPools[log.args.recipient.toLowerCase()]) txs[log.transactionHash].managerFee += BigInt(log.args.amount1)
    for (const log of lendingPayouts)
        if (txs[log.transactionHash]) txs[log.transactionHash].managerFee += BigInt(log.args.amount)

    for (const { managerFee, bps } of Object.values(txs)) {
        if (!managerFee) continue
        const fee = managerFee * BPS / bps
        dailyFees.add(ADDRESSES.hyperliquid.WHYPE, fee, 'Instant Withdrawal Fees')
        dailyRevenue.add(ADDRESSES.hyperliquid.WHYPE, managerFee, 'Instant Withdrawal Fees To Valantis')
        dailySupplySideRevenue.add(ADDRESSES.hyperliquid.WHYPE, fee - managerFee, 'Instant Withdrawal Fees To LPs')
    }
}

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyRevenue = options.createBalances()
    const pools = await options.getLogs({
        target: factory,
        eventAbi: poolCreated,
        fromBlock: 1588292,
        cacheInCloud: true
    })
    const pairObject: IJSON<string[]> = {}
    pools.forEach(log => pairObject[log.pool.toLowerCase()] = [log.token0, log.token1])
    const filteredPools = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances})
    const filteredPoolsArray = Object.keys(filteredPools)
    const [swaps, poolManagerFees] = await Promise.all([
        options.getLogs({
            targets: filteredPoolsArray,
            eventAbi: swapEvent,
            onlyArgs: false,
        }),
        options.api.multiCall({
            calls: filteredPoolsArray,
            abi: "uint256:poolManagerFeeBips"
        })
    ])
    poolManagerFees.forEach((fee, i) => pairObject[filteredPoolsArray[i]].push(fee))
    swaps.forEach(log => {
        const pool = log.address
        const { amountIn, amountOut, isZeroToOne, fee} = log.args
        const [token0, token1, protocolFeeBips] = pairObject[pool.toLowerCase()]
        const feeToken = isZeroToOne ? token0 : token1
        const protocolFee = BigInt(fee) * BigInt(protocolFeeBips) / BPS
        if (isZeroToOne) {
            addOneToken({ chain: options.chain, balances: dailyVolume, token0: token0, amount0: amountIn, token1: token1, amount1: amountOut})
        }
        else {
            addOneToken({ chain: options.chain, balances: dailyVolume, token0: token0, amount0: amountOut, token1: token1, amount1: amountIn})
        }
        dailyFees.add(feeToken, fee, METRIC.SWAP_FEES)
        dailyRevenue.add(feeToken, protocolFee, METRIC.PROTOCOL_FEES)
        dailySupplySideRevenue.add(feeToken, BigInt(fee) - protocolFee, METRIC.LP_FEES)
    })
    await addInstantWithdrawalFees(options, dailyFees, dailyRevenue, dailySupplySideRevenue)
    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue.clone(),
    }
}

const methodology = {
    Fees: "Swap fees paid by traders on Valantis pools, plus the spread paid by LPs who exit a STEX pool instantly in HYPE.",
    Revenue: "The pool manager share (20% on the STEX pools) of swap fees and instant-withdrawal spreads, kept by Valantis.",
    ProtocolRevenue: "The pool manager share (20% on the STEX pools) of swap fees and instant-withdrawal spreads, sent to Valantis.",
    SupplySideRevenue: "Swap fees and instant-withdrawal spreads left to liquidity providers after the pool manager share.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "Swap fees paid by traders on Valantis pools",
        'Instant Withdrawal Fees': "Discount LPs accept to swap their stHYPE/kHYPE share to HYPE instantly when leaving a STEX pool",
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "The pool manager share of the swap fees",
        'Instant Withdrawal Fees To Valantis': "The pool manager share of the instant-withdrawal spread",
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "The pool manager share of the swap fees",
        'Instant Withdrawal Fees To Valantis': "The pool manager share of the instant-withdrawal spread",
    },
    SupplySideRevenue: {
        [METRIC.LP_FEES]: "Swap fees left to liquidity providers after the pool manager share",
        'Instant Withdrawal Fees To LPs': "Instant-withdrawal spread left to the remaining liquidity providers",
    },
}

const adapter : SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    start: "2025-03-27",
    methodology,
    breakdownMethodology
}

export default adapter
