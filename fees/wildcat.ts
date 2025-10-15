import { ChainApi } from "@defillama/sdk";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";



const fetchFees = async (options: FetchOptions): Promise<FetchResultV2> => {
    const { api } = options
    const { markets, tokens } = await getMarkets(api)
    const apy = await getApy(options, markets, tokens)
    const totalBorrow = await getTotalBorrow(options, markets, tokens)
    const dailyFees = options.createBalances();

    totalBorrow.forEach((borrow: any) => {
        const _apy = apy.find((item: any) => item.market === borrow.market)
        const dailyApy = _apy.apy / 100 / 365
        const fees = Number(borrow.totalBorrow) * dailyApy
        dailyFees.add(borrow.token, fees)
    })
    const dailyRevenue = dailyFees.clone(0.05)
    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    }
}


const getApy = async (options: FetchOptions, markets: string[], tokens: string[]): Promise<any> => {
    const { api } = options
    const apy = await Promise.all(markets.map(async (market) => {
        const annualInterestBips = await api.call({ abi: 'uint256:annualInterestBips', target: market })
        const annualRate = Number(annualInterestBips) / 10000;
        const dailyRate = annualRate / 365;
        const apy = (Math.pow(1 + dailyRate, 365) - 1) * 100;
        return {
            market,
            annualInterestBips,
            token: tokens[markets.indexOf(market)],
            apy
        }
    }))
    return apy
}

const getTotalBorrow = async (options: FetchOptions, markets: string[], tokens: string[]): Promise<any> => {
    const { api } = options
    const totalBorrow = await Promise.all(markets.map(async (market) => {
        const totalBorrow = await api.call({ abi: 'uint256:totalDebts', target: market })
        return {
            market,
            totalBorrow,
            token: tokens[markets.indexOf(market)]
        }
    }))
    return totalBorrow
}

async function getMarkets(api: ChainApi) {
    const markets = await api.call({ abi: 'address[]:getRegisteredMarkets', target: "0xfEB516d9D946dD487A9346F6fee11f40C6945eE4" })
    const tokens = await api.multiCall({ abi: 'address:asset', calls: markets })
    return { markets, tokens }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetchFees,
            start: '2023-06-22',
        }
    },
    methodology: {
        Fees: 'All interests paid by borrowers.',
        Revenue: '5% fees are collected by Wildcat Protocol.',
        ProtocolRevenue: '5% fees are collected by Wildcat Protocol.',
    }
}

export default adapter
