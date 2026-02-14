import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

const dolomiteMarginAddresses = {
    [CHAIN.ARBITRUM]: "0x6Bd780E7fDf01D77e4d475c821f1e7AE05409072",
    [CHAIN.BERACHAIN]: "0x003Ca23Fd5F0ca87D01F6eC6CD14A8AE60c2b97D",
    [CHAIN.ETHEREUM]: "0x003Ca23Fd5F0ca87D01F6eC6CD14A8AE60c2b97D",
    [CHAIN.MANTLE]: "0xE6Ef4f0B2455bAB92ce7cC78E35324ab58917De8",
    [CHAIN.POLYGON_ZKEVM]: "0x836b557Cf9eF29fcF49C776841191782df34e4e5",
    [CHAIN.XLAYER]: "0x836b557Cf9eF29fcF49C776841191782df34e4e5"
}

const dolomiteMarginABI = {
    getNumMarkets: "function getNumMarkets() view returns (uint256)",
    getMarketWithInfoArbitrum: "function getMarketWithInfo(uint256 marketId) view returns (address token, bool isClosing, bool isRecyclable, (uint128 borrow, uint128 supply) totalPar, (uint96 borrow, uint96 supply, uint32 lastUpdate) index, address priceOracle, address interestSetter, (uint256 value) marginPremium, (uint256 value) spreadPremium, (bool sign, uint256 value) maxWei, (uint96 borrow, uint96 supply, uint32 lastUpdate) interestIndex, (uint256 value) price, (uint256 value) interestRate)",
    getMarketWithInfo: "function getMarketWithInfo(uint256 marketId) view returns (tuple(address token, bool isClosing, tuple(uint128 borrow, uint128 supply) totalPar, tuple(uint112 borrow, uint112 supply, uint32 lastUpdate) index, address priceOracle, address interestSetter, tuple(uint256 value) marginPremium, tuple(uint256 value) liquidationSpreadPremium, tuple(bool sign, uint256 value) maxSupplyWei, tuple(bool sign, uint256 value) maxBorrowWei, tuple(uint256 value) earningsRateOverride), tuple(uint112 borrow, uint112 supply, uint32 lastUpdate), tuple(uint256 value), tuple(uint256 value))",
    getEarningsRate: "function getEarningsRate() view returns (uint256)",
    getMarketTokenAddress: "function getMarketTokenAddress(uint256 marketId) view returns (address)",
    getMarketTotalPar: "function getMarketTotalPar(uint256 marketId) view returns (tuple(uint128 borrow, uint128 supply))",
    getMarketCurrentIndex: "function getMarketCurrentIndex(uint256 marketId) view returns (tuple(uint112 borrow, uint112 supply, uint32 lastUpdate))",
}

const fetchArbitrum = async ({ createBalances, api, chain, fromApi, toApi }: FetchOptions) => {
    const dailyFees = createBalances(); const dailyRevenue = createBalances()
    const marketLength = await api.call({ target: dolomiteMarginAddresses[chain], abi: dolomiteMarginABI.getNumMarkets })
    const earningRate = await api.call({ target: dolomiteMarginAddresses[chain], abi: dolomiteMarginABI.getEarningsRate })
    if (marketLength === 0) return {}

    const markets = Array.from({ length: marketLength }, (_, i) => ({ target: dolomiteMarginAddresses[chain], params: i }));

    const marketsTokenAddress = await api.multiCall({ abi: dolomiteMarginABI.getMarketTokenAddress, calls: markets.map((market) => ({ target: market.target, params: [market.params] })) })
    const marketsTotalPar = await fromApi.multiCall({ abi: dolomiteMarginABI.getMarketTotalPar, calls: markets.map((market) => ({ target: market.target, params: [market.params] })) })
    const marketsCurrentIndex = await fromApi.multiCall({ abi: dolomiteMarginABI.getMarketCurrentIndex, calls: markets.map((market) => ({ target: market.target, params: [market.params] })) })
    const marketsEndIndex = await toApi.multiCall({ abi: dolomiteMarginABI.getMarketCurrentIndex, calls: markets.map((market) => ({ target: market.target, params: [market.params] })) })
    const earningsRate = 1 - (earningRate / 1e18)

    marketsTokenAddress.map((token, i) => {
        const indexChange = (BigInt(marketsEndIndex[i].borrow) - BigInt(marketsCurrentIndex[i].borrow)) * BigInt(marketsTotalPar[i].borrow) / BigInt(1e18)

        dailyFees.add(token, indexChange, METRIC.BORROW_INTEREST)
        dailyRevenue.add(token, Number(indexChange) * earningsRate, METRIC.PROTOCOL_FEES)
    })

    const dailySupplySideRevenue = createBalances()
    const tempBalance = dailyFees.clone()
    tempBalance.subtract(dailyRevenue)
    dailySupplySideRevenue.addBalances(tempBalance, METRIC.LP_FEES)
    return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const fetch = async ({ createBalances, api, chain, fromApi, toApi }: FetchOptions) => {
    const dailyFees = createBalances(); const dailyRevenue = createBalances()
    const marketLength = await api.call({ target: dolomiteMarginAddresses[chain], abi: dolomiteMarginABI.getNumMarkets })
    const earningRate = await api.call({ target: dolomiteMarginAddresses[chain], abi: dolomiteMarginABI.getEarningsRate })
    if (marketLength === 0) return {}

    const markets = Array.from({ length: marketLength }, (_, i) => ({ target: dolomiteMarginAddresses[chain], params: i }));

    const marketsWithInfo = (await fromApi.multiCall({ abi: dolomiteMarginABI.getMarketWithInfo, calls: markets, permitFailure: true }))
    .map((market, i) => {   
        if (!market) return
        return{
          token: market[0].token,
          borrowIndex: market[0].index.borrow,
          borrowPar: market[0].totalPar.borrow,
          borrowWei: BigInt(market[0].totalPar.borrow) * BigInt(market[0].index.borrow) / BigInt(1e18),
          earningsRate: market[0].earningsRateOverride.value != 0 ? market[0].earningsRateOverride.value : earningRate,
          borrowInterestRateAPR: market[3] * 31536000
        }
    })

    const marketsWithInfoEnd = (await toApi.multiCall({ abi: dolomiteMarginABI.getMarketWithInfo, calls: markets, permitFailure: true }))
    .map((market, i) => {
        if (!market) return
        return{
        token: market[0].token,
        borrowIndex: market[0].index.borrow,
        borrowPar: market[0].totalPar.borrow,
        borrowWei: BigInt(market[0].totalPar.borrow) * BigInt(market[0].index.borrow) / BigInt(1e18),
        earningsRate: market[0].earningsRateOverride.value != 0 ? market[0].earningsRateOverride.value : earningRate,
        borrowInterestRateAPR: market[3] * 31536000
    }})

    marketsWithInfo.map((market, i) => {
        if (!market || !marketsWithInfoEnd[i]) return
        const interestEarned = (BigInt(marketsWithInfoEnd[i].borrowIndex) - BigInt(market.borrowIndex)) * BigInt(market.borrowPar) / BigInt(1e18)
        const earningRate = 1 - (market.earningsRate / 1e18)
        dailyFees.add(market.token, interestEarned, METRIC.BORROW_INTEREST)
        dailyRevenue.add(market.token, Number(interestEarned) * earningRate, METRIC.PROTOCOL_FEES)
    })

    const dailySupplySideRevenue = createBalances()
    const tempBalance = dailyFees.clone()
    tempBalance.subtract(dailyRevenue)
    dailySupplySideRevenue.addBalances(tempBalance, METRIC.LP_FEES)
    return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const methodology = {
    dailyFees: "Interest paid by the borrowers",
    dailyRevenue: "Portion of fees that goes to the protocol",
    dailySupplySideRevenue: "Portion of fees that goes to the lenders"
}

const breakdownMethodology = {
    Fees: {
        [METRIC.BORROW_INTEREST]: 'Interest accrued on borrowed assets, calculated from the change in borrow index multiplied by total borrowed principal'
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: 'Portion of borrow interest retained by the protocol treasury, determined by the earnings rate (typically 5-15% of total interest)'
    },
    SupplySideRevenue: {
        [METRIC.LP_FEES]: 'Portion of borrow interest distributed to lenders who supply liquidity to the protocol'
    }
}

const adapters: Adapter = {
    methodology,
    breakdownMethodology,
    adapter: {
        [CHAIN.ARBITRUM]: { fetch: fetchArbitrum, start: '2022-10-03', },
        [CHAIN.BERACHAIN]: { fetch: fetch, start: '2024-01-24', },
        [CHAIN.ETHEREUM]: { fetch: fetch, start: '2025-06-22', },
        [CHAIN.MANTLE]: { fetch: fetch, start: '2024-04-28', },
        [CHAIN.POLYGON_ZKEVM]: { fetch: fetch, start: '2024-02-01', },
        // [CHAIN.XLAYER]: { fetch: fetch, start: '2024-04-28', }
    },
    version: 2
}

export default adapters;