import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types";
import * as sdk from "@defillama/sdk";

const comptrollerABI = {
    underlying: "address:underlying",
    exchangeRateCurrent: "uint256:exchangeRateCurrent",
    getAllMarkets: "address[]:getAllMarkets",
    liquidationIncentiveMantissa: "uint256:liquidationIncentiveMantissa",
    accrueInterest: "event AccrueInterest(uint256 cashPrior,uint256 interestAccumulated,uint256 borrowIndex,uint256 totalBorrows)",
    reservesAdded: "event ReservesAdded(address benefactor,uint256 addAmount,uint256 newTotalReserves)",
    liquidateBorrow: "event LiquidateBorrow (address liquidator, address borrower, uint256 repayAmount, address mTokenCollateral, uint256 seizeTokens)",
    reserveFactor: "uint256:reserveFactorMantissa",
};

const moonbeamUnitroller = "0x8E00D5e02E65A19337Cdba98bbA9F84d4186a180";

async function getFees(market: string, { createBalances, api, getLogs, }: FetchOptions, {
    dailyFees,
    dailyRevenue,
    abis = {},
}: {
    dailyFees?: sdk.Balances,
    dailyRevenue?: sdk.Balances,
    abis?: any
}) {
    if (!dailyFees) dailyFees = createBalances()
    if (!dailyRevenue) dailyRevenue = createBalances()
    const markets = await api.call({ target: market, abi: comptrollerABI.getAllMarkets, })
    const liquidationIncentiveMantissa = await api.call({ target: market, abi: comptrollerABI.liquidationIncentiveMantissa, })
    const underlyings = await api.multiCall({ calls: markets, abi: comptrollerABI.underlying, permitFailure: true, });
    const exchangeRatesCurrent = await api.multiCall({ calls: markets, abi: comptrollerABI.exchangeRateCurrent, permitFailure: true, });
    underlyings.forEach((underlying, index) => {
        if (!underlying) underlyings[index] = "0x0000000000000000000000000000000000000000"
    })
    const reserveFactors = await api.multiCall({ calls: markets, abi: abis.reserveFactor ?? comptrollerABI.reserveFactor, });
    const logs: any[] = (await getLogs({
        targets: markets,
        flatten: false,
        eventAbi: comptrollerABI.accrueInterest,
    })).map((log: any, index: number) => {
        return log.map((i: any) => ({
            ...i,
            interestAccumulated: Number(i.interestAccumulated),
            marketIndex: index,
        }));
    }).flat()

    const reservesAddedLogs: any[] = (await getLogs({
        targets: markets,
        flatten: false,
        eventAbi: comptrollerABI.reservesAdded,
    })).map((log: any, index: number) => {
        return log.map((i: any) => ({
            ...i,
            addAmount: Number(i.addAmount),
            marketIndex: index,
        }));
    }).flat()

    const liquidateBorrowLogs: any[] = (await getLogs({
        targets: markets,
        flatten: false,
        eventAbi: comptrollerABI.liquidateBorrow,
    })).map((log: any, _index: number) => {
        return log.map((i: any) => ({
            ...i,
            seizeTokens: Number(i.seizeTokens),
            marketIndex: markets.indexOf(i.mTokenCollateral),
        }));
    }).flat()

    logs.forEach((log: any) => {
        const marketIndex = log.marketIndex;
        const underlying = underlyings[marketIndex]
        dailyFees!.add(underlying, log.interestAccumulated);
        dailyRevenue!.add(underlying, log.interestAccumulated * Number(reserveFactors[marketIndex]) / 1e18);
    })

    reservesAddedLogs.forEach((log: any) => {
        const marketIndex = log.marketIndex;
        const underlying = underlyings[marketIndex]
        dailyRevenue!.add(underlying, log.addAmount);
    })

    liquidateBorrowLogs.forEach((log: any) => {
        const marketIndex = log.marketIndex;
        const underlying = underlyings[marketIndex]
        dailyFees!.add(underlying, (log.seizeTokens * ((liquidationIncentiveMantissa / 1e18) - 1) * (exchangeRatesCurrent[marketIndex] / 1e18)));
    })

    return { dailyFees, dailyRevenue }
}

const methodology = {
    Fees: "Total interest paid by borrowers",
    Revenue: "Protocol's share of interest treasury",
    ProtocolRevenue: "Protocol's share of interest into treasury",
    HoldersRevenue: "No revenue for WELL holders.",
    SupplySideRevenue: "Interest paid to lenders in liquidity pools"
}

function moonwellArtemisExport(config: { moonbeam: string }) {
    const exportObject: BaseAdapter = {}
    Object.entries(config).map(([chain, market]) => {
        exportObject[chain] = {
            fetch: (async (options: FetchOptions) => {
                const { dailyFees, dailyRevenue } = await getFees(market, options, {})
                const dailySupplySideRevenue = options.createBalances()
                dailySupplySideRevenue.addBalances(dailyFees)
                Object.entries(dailyRevenue.getBalances()).forEach(([token, balance]) => {
                    dailySupplySideRevenue.addTokenVannila(token, Number(balance) * -1)
                })
                return { dailyFees, dailyRevenue, dailyHoldersRevenue: 0, dailySupplySideRevenue }
            }),
        }
    })
    return { adapter: exportObject, version: 2, allowNegativeValue: true, methodology, } as SimpleAdapter
}

export default moonwellArtemisExport({ moonbeam: moonbeamUnitroller });
