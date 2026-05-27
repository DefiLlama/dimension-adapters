import { cache } from "@defillama/sdk";
import type { FetchV2, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken, isCoreAsset } from "../../helpers/prices";
import { METRIC } from "../../helpers/metrics";

const FPMM_FACTORY = '0xa849b475FE5a4B5C9C3280152c7a1945b907613b';
const SWAP_EVENT = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

const fetch: FetchV2 = async ({ createBalances, getLogs, chain, api }) => {
    const cacheKey = `tvl-adapter-cache/cache/mento-v3/${chain}.json`;

    let { pools, token0s, token1s, lpFees, protocolFees } = await cache.readCache(cacheKey, { readFromR2Cache: true })
    if (!pools?.length) {
        pools = await api.call({ abi: 'address[]:deployedFPMMAddresses', target: FPMM_FACTORY })
        token0s = await api.multiCall({ abi: 'address:token0', calls: pools })
        token1s = await api.multiCall({ abi: 'address:token1', calls: pools })
        lpFees = (await api.multiCall({ abi: 'uint256:lpFee', calls: pools })).map(fee => Number(fee) / 10_000)
        protocolFees = (await api.multiCall({ abi: 'uint256:protocolFee', calls: pools })).map(fee => Number(fee) / 10_000)
    }

    const poolsObject: IJSON<[string, string, number, number]> = {}
    pools.forEach((pair: string, i: number) => {
        poolsObject[pair] = [token0s[i], token1s[i], lpFees[i], protocolFees[i]]
    })
    const dailyVolume = createBalances()
    const dailyFees = createBalances()
    const dailySupplySideRevenue = createBalances()
    const dailyRevenue = createBalances()
    const pairIds = Object.keys(poolsObject)

    if (!pairIds.length) return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }

    const allLogs = await getLogs({ targets: pairIds, eventAbi: SWAP_EVENT, flatten: false })
    allLogs.forEach((logs, index) => {
        if (!logs.length)
            return;

        const pair = pairIds[index]
        const [token0, token1, lpFee, protocolFee] = poolsObject[pair]
        const fees = lpFee + protocolFee
        logs.forEach((log) => {
            const amount0 = log.amount0Out > 0n ? Number(log.amount0Out) : Number(log.amount0In);
            const amount1 = log.amount1Out > 0n ? Number(log.amount1Out) : Number(log.amount1In);

            addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })

            if (isCoreAsset(chain, token0)) {
                dailyFees.add(token0, amount0 * fees, METRIC.SWAP_FEES)
                dailySupplySideRevenue.add(token0, amount0 * lpFee, METRIC.SWAP_FEES)
                dailyRevenue.add(token0, amount0 * protocolFee, METRIC.SWAP_FEES)
            } else {
                dailyFees.add(token1, amount1 * fees, METRIC.SWAP_FEES)
                dailySupplySideRevenue.add(token1, amount1 * lpFee, METRIC.SWAP_FEES)
                dailyRevenue.add(token1, amount1 * protocolFee, METRIC.SWAP_FEES)
            }
        })
    })

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Volume: "Swap volume from input amounts (core-asset side via addOneToken).",
    Fees: "Total swap fees (LP fee + protocol fee) charged on each swap, expressed as a fraction of swap input amount.",
    UserFees: "Total swap fees (LP fee + protocol fee) charged on each swap, expressed as a fraction of swap input amount.",
    SupplySideRevenue: "LP fee portion of swap fees that remains in the pool, accruing to liquidity providers.",
    ProtocolRevenue: "Protocol fee portion of swap fees sent to the Mento protocol fee recipient.",
    Revenue: "Protocol fee portion of swap fees sent to the Mento protocol fee recipient.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "Total fees paid by users on each swap, expressed as a fraction of swap input amount.",
    },
    UserFees: {
        [METRIC.SWAP_FEES]: "Total fees paid by users on each swap, expressed as a fraction of swap input amount.",
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "Protocol fee portion of swap fees sent to the Mento protocol fee recipient.",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "Protocol fee portion of swap fees sent to the Mento protocol fee recipient.",
    },
    SupplySideRevenue: {
        [METRIC.SWAP_FEES]: "LP fee portion of swap fees that remains in the pool, accruing to liquidity providers.",
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.CELO]: {
            fetch,
            start: '2026-03-04',
        },
        [CHAIN.MONAD]: {
            fetch,
            start: '2026-03-11',
        },
    },
    fetch,
    methodology,
    breakdownMethodology,
}

export default adapter;
