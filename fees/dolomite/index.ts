import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const dolomiteMarginAddresses = {
    [CHAIN.ARBITRUM]: "0x6Bd780E7fDf01D77e4d475c821f1e7AE05409072",
    [CHAIN.BERACHAIN]: "0x003Ca23Fd5F0ca87D01F6eC6CD14A8AE60c2b97D",
    [CHAIN.BASE]: "0x003Ca23Fd5F0ca87D01F6eC6CD14A8AE60c2b97D"
}

const dolomiteMarginABI = {
    getNumMarkets: "function getNumMarkets() view returns (uint256)",
    getMarketBorrowInterestRateApr: "function getMarketBorrowInterestRateApr(uint256 marketId) view returns (tuple(uint256 value))",
    getMarketTokenAddress: "function getMarketTokenAddress(uint256 marketId) view returns (address)",
    getMarketTotalWei: "function getMarketTotalWei(uint256 marketId) view returns (tuple(uint128 borrow, uint128 supply))",
    getEarningsRate: "function getEarningsRate() view returns (uint256)"
}

const fetch = async ({ createBalances, api, getLogs, chain }: FetchOptions) => {
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const marketLength = await api.call({ target: dolomiteMarginAddresses[chain], abi: dolomiteMarginABI.getNumMarkets })
    const earningRate = await api.call({ target: dolomiteMarginAddresses[chain], abi: dolomiteMarginABI.getEarningsRate })
    if (marketLength === 0) return {}
    //dolomite doesn't have a way to get all markets in one go
    const markets = Array.from({ length: marketLength }, (_, i) => ({
        target: dolomiteMarginAddresses[chain],
        params: i 
    }));

    //interest rate is in apr 18 decimals
    const marketsBorrowInterestRateApr = await api.multiCall({
        abi: dolomiteMarginABI.getMarketBorrowInterestRateApr,
        calls: markets.map((market) => ({
            target: market.target,
            params: [market.params]
        }))
    })

    const marketsTokenAddress = await api.multiCall({
        abi: dolomiteMarginABI.getMarketTokenAddress,
        calls: markets.map((market) => ({
            target: market.target,
            params: [market.params]
        }))
    })

    const marketsTotalWei = await api.multiCall({
        abi: dolomiteMarginABI.getMarketTotalWei,
        calls: markets.map((market) => ({
            target: market.target,
            params: [market.params]
        }))
    })

    const earningsRate = 1 - (earningRate / 1e18)
    marketsBorrowInterestRateApr.map((rate, i) => {
        const token = marketsTokenAddress[i]
        const totalWei = marketsTotalWei[i] //0 is borrow, 1 is supply
        const borrowInterestRate = rate / 1e18 / 365
        const dailyBorrowInterest = totalWei[0] * borrowInterestRate
        dailyFees.add(token, dailyBorrowInterest)
        dailyRevenue.add(token, dailyBorrowInterest * earningsRate)
    })

    const dailySupplySideRevenue = dailyFees.clone()
    dailySupplySideRevenue.subtract(dailyRevenue)

    return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const methodology = {
    dailyFees: "Interest that are paid by the borrowers to the vaults",
    dailyRevenue: "Protocol & Governor fees share"
}

const adapters: Adapter = {
    adapter: {
        [CHAIN.BERACHAIN]: {
            fetch: fetch,
            start: '2024-08-18',
            meta: {
                methodology
            }
        },
        // [CHAIN.SONIC]: {
        //     fetch: fetch,
        //     start: '2025-01-31',
        //     meta: {
        //         methodology
        //     }
        // },
        // [CHAIN.BASE]: {
        //     fetch: fetch,
        //     start: '2024-11-27',
        //     meta: {
        //         methodology
        //     }
        // }
    },

    version: 2
}

export default adapters;