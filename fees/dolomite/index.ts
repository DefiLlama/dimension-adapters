import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const dolomiteMarginAddresses = {
    [CHAIN.ARBITRUM]: "0x6Bd780E7fDf01D77e4d475c821f1e7AE05409072",
    [CHAIN.BERACHAIN]: "0x003Ca23Fd5F0ca87D01F6eC6CD14A8AE60c2b97D",
    [CHAIN.MANTLE]: "0xE6Ef4f0B2455bAB92ce7cC78E35324ab58917De8",
    [CHAIN.POLYGON_ZKEVM]: "0x836b557Cf9eF29fcF49C776841191782df34e4e5",
    [CHAIN.XLAYER]: "0x836b557Cf9eF29fcF49C776841191782df34e4e5"
}

const dolomiteMarginABI = {
    getNumMarkets: "function getNumMarkets() view returns (uint256)",
    getMarketTokenAddress: "function getMarketTokenAddress(uint256 marketId) view returns (address)",
    getMarketTotalPar: "function getMarketTotalPar(uint256 marketId) view returns (tuple(uint128 borrow, uint128 supply))",
    getMarketCurrentIndex: "function getMarketCurrentIndex(uint256 marketId) view returns (tuple(uint112 borrow, uint112 supply, uint32 lastUpdate))",
    getMarketBorrowInterestRatePerSecond: "function getMarketBorrowInterestRatePerSecond(uint256 marketId) view returns (tuple(uint256 value))",
    getEarningsRate: "function getEarningsRate() view returns (uint256)",
    getMarketInterestSetter: "function getMarketInterestSetter(uint256 marketId) view returns (address)"

}

const interestRateSetterABI = {
    "getInterestRate": "function getInterestRate(address token, uint256 borrowWei, uint256 supplyWei) view returns (tuple(uint256 value))"
}

const fetch = async ({ createBalances, api, getLogs, chain }: FetchOptions) => {
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const marketLength = await api.call({ target: dolomiteMarginAddresses[chain], abi: dolomiteMarginABI.getNumMarkets })
    const earningRate = await api.call({ target: dolomiteMarginAddresses[chain], abi: dolomiteMarginABI.getEarningsRate })
    if (marketLength === 0) return {}

    //dolomite doesn't have a way to get all markets info in one go
    const markets = Array.from({ length: marketLength }, (_, i) => ({
        target: dolomiteMarginAddresses[chain],
        params: i 
    }));

    const marketsTokenAddress = await api.multiCall({
        abi: dolomiteMarginABI.getMarketTokenAddress,
        calls: markets.map((market) => ({
            target: market.target,
            params: [market.params]
        }))
    })

    const marketsInterestSetter = await api.multiCall({
        abi: dolomiteMarginABI.getMarketInterestSetter,
        calls: markets.map((market) => ({
            target: market.target,
            params: [market.params]
        }))
    })

    const marketsTotalPar = await api.multiCall({
        abi: dolomiteMarginABI.getMarketTotalPar,
        calls: markets.map((market) => ({
            target: market.target,
            params: [market.params]
        }))
    })

    const marketsCurrentIndex = await api.multiCall({
        abi: dolomiteMarginABI.getMarketCurrentIndex,
        calls: markets.map((market) => ({
            target: market.target,
            params: [market.params]
        }))
    })
    const marketsTotalWei = marketsTotalPar.map((par, i) => [
        BigInt(par.borrow) * BigInt(marketsCurrentIndex[i].borrow) / BigInt(1e18),
        BigInt(par.supply) * BigInt(marketsCurrentIndex[i].supply) / BigInt(1e18)
    ].map(val => val.toString()))


    const marketsBorrowInterestRatePerSecond = await api.multiCall({
        abi: interestRateSetterABI.getInterestRate,
        calls: markets.map((market, i) => ({
            target: marketsInterestSetter[i],
            params: [marketsTokenAddress[i], marketsTotalWei[i][0], marketsTotalWei[i][1]]
        }))
    })

    const marketsBorrowInterestRateApr = marketsBorrowInterestRatePerSecond.map((rate) => rate * 31536000)


    const earningsRate = 1 - (earningRate / 1e18)
    marketsBorrowInterestRateApr.map((rate, i) => {
        const token = marketsTokenAddress[i]
        const totalWei = marketsTotalWei[i]
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
    dailyFees: "Interest paid by the borrowers",
    dailyRevenue: "Portion of fees that goes to the protocol",
    dailySupplySideRevenue: "Portion of fees that goes to the lenders"
}

const adapters: Adapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
            start: '2022-10-03',
            meta: {
                methodology
            }
        },
        [CHAIN.BERACHAIN]: {
            fetch: fetch,
            start: '2024-01-24',
            meta: {
                methodology
            }
        },
        [CHAIN.MANTLE]: {
            fetch: fetch,
            start: '2024-04-28',
            meta: {
                methodology
            }
        },
        [CHAIN.POLYGON_ZKEVM]: {
            fetch: fetch,
            start: '2024-02-01',
            meta: {
                methodology
            }
        },
        [CHAIN.XLAYER]: {
            fetch: fetch,
            start: '2024-04-28',
            meta: {
                methodology
            }
        }
    },

    version: 2
}

export default adapters;