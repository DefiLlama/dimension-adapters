import { FetchOptions, IJSON, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { addOneToken } from '../../helpers/prices';
import { filterPools } from "../../helpers/uniswap"

const factory = "0x7E028ac56cB2AF75292F3D967978189698C24732"
const poolCreated = "event SovereignPoolDeployed(address indexed token0, address indexed token1, address pool)"
const swapEvent = "event Swap(address indexed sender, bool isZeroToOne, uint256 amountIn, uint256 fee, uint256 amountOut)"

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
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
            entireLog: true
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
        const protocolFee = Number(protocolFeeBips) / 10000
        if (isZeroToOne) {
            addOneToken({ chain: options.chain, balances: dailyVolume, token0: token0, amount0: amountIn, token1: token1, amount1: amountOut})
            dailySupplySideRevenue.add(token0, Number(fee) * (1-protocolFee))
            dailyProtocolRevenue.add(token0, Number(fee) * protocolFee)
        }
        else {
            addOneToken({ chain: options.chain, balances: dailyVolume, token0: token0, amount0: amountOut, token1: token1, amount1: amountIn})
            dailySupplySideRevenue.add(token1, Number(fee) * (1-protocolFee))
            dailyProtocolRevenue.add(token1, Number(fee) * protocolFee)
        }
    })
    const dailyFees = dailySupplySideRevenue.clone() 
    dailyFees.addBalances(dailyProtocolRevenue)
    return {
        dailyVolume,
        dailyFees: dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue
    }
}

const methodology = {
    Fees: "Swap fees on Valantis STEX pools",
    ProtocolRevenue: "The protocol keeps 20% of the swap fees",
    SupplySideRevenue: "80% of the swap fees",
    Revenue: "The protocol keeps 20% of the swap fees"
}

const adapter : SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    start: "2025-03-27",
    methodology
}

export default adapter