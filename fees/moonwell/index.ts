import ADDRESSES from '../../helpers/coreAssets.json'
import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import { METRIC } from "../../helpers/metrics";

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

const baseUnitroller = "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C";
const moonbeamUnitroller = "0x8E00D5e02E65A19337Cdba98bbA9F84d4186a180";
const moonriverUnitroller = "0x0b7a0EAA884849c6Af7a129e899536dDDcA4905E";
const optimismUnitroller = "0xCa889f40aae37FFf165BccF69aeF1E82b5C511B9";

async function getFees(market: string, { createBalances, api, getLogs, }: FetchOptions, {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    abis = {},
}: {
    dailyFees?: sdk.Balances,
    dailyRevenue?: sdk.Balances,
    dailySupplySideRevenue?: sdk.Balances,
    abis?: any
}) {
    if (!dailyFees) dailyFees = createBalances()
    if (!dailyRevenue) dailyRevenue = createBalances()
    if (!dailySupplySideRevenue) dailySupplySideRevenue = createBalances()
    let markets
    try {
        markets = await api.call({ target: market, abi: comptrollerABI.getAllMarkets, })
    } catch (error) {
        return { dailyFees, dailyRevenue }
    }
    const liquidationIncentiveMantissa = await api.call({ target: market, abi: comptrollerABI.liquidationIncentiveMantissa, })
    const underlyings = await api.multiCall({ calls: markets, abi: comptrollerABI.underlying, permitFailure: true, });
    const exchangeRatesCurrent = await api.multiCall({ calls: markets, abi: comptrollerABI.exchangeRateCurrent, permitFailure: true, });
    underlyings.forEach((underlying, index) => {
        if (!underlying) underlyings[index] = ADDRESSES.null
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
    })).map((log: any, index: number) => {
        return log.map((i: any) => ({
            ...i,
            seizeTokens: Number(i.seizeTokens),
            marketIndex: markets.indexOf(i.mTokenCollateral),
        }));
    }).flat()

    logs.forEach((log: any) => {
        const marketIndex = log.marketIndex;
        const underlying = underlyings[marketIndex]
        const reserveShare = log.interestAccumulated * Number(reserveFactors[marketIndex]) / 1e18;
        const lenderShare = log.interestAccumulated - reserveShare;
        dailyFees!.add(underlying, log.interestAccumulated, METRIC.BORROW_INTEREST);
        dailyRevenue!.add(underlying, reserveShare, METRIC.BORROW_INTEREST);
        dailySupplySideRevenue!.add(underlying, lenderShare, METRIC.BORROW_INTEREST);
    })

    liquidateBorrowLogs.forEach((log: any) => {
        const marketIndex = log.marketIndex;
        const underlying = underlyings[marketIndex]
        const liquidationIncentive = (log.seizeTokens * ((liquidationIncentiveMantissa / 1e18) - 1) * (exchangeRatesCurrent[marketIndex] / 1e18))
        dailyFees!.add(underlying, liquidationIncentive, METRIC.LIQUIDATION_FEES);
        dailyRevenue.add(underlying, liquidationIncentive * 0.3, METRIC.LIQUIDATION_FEES);
        dailySupplySideRevenue.add(underlying, liquidationIncentive * 0.7, METRIC.LIQUIDATION_FEES);
    })

    return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const methodology = {
    Fees: "Total interest paid by borrowers",
    Revenue: "Protocol's share of interest treasury",
    ProtocolRevenue: "Protocol's share of interest into treasury",
    HoldersRevenue: "No revenue for WELL holders.",
    SupplySideRevenue: "Interest paid to lenders in liquidity pools and liquidation incentives"
}

function moonwellExport(config: IJSON<string>) {
    const exportObject: BaseAdapter = {}
    Object.entries(config).map(([chain, market]) => {
        exportObject[chain] = {
            fetch: (async (options: FetchOptions) => {
                const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await getFees(market, options, {})
                return { dailyFees, dailyRevenue, dailyHoldersRevenue: 0, dailySupplySideRevenue }
            }),
        }
    })
    // dailySupplySideRevenue could be negative if protocol revenue exceeds total fees, though unlikely in normal conditions(like bad liquidations)
    return {
        adapter: exportObject,
        version: 2,
        pullHourly: true,
        allowNegativeValue: true,
        methodology,
        breakdownMethodology: {
            Fees: {
                [METRIC.BORROW_INTEREST]: "Interest accrued daily by borrowers across all lending markets",
                [METRIC.LIQUIDATION_FEES]: "The Liquidation Incentive is equivalent to 10% of the outstanding borrow amount",
            },
            Revenue: {
                [METRIC.BORROW_INTEREST]: "Portion of borrow interest directed to protocol reserves, determined by each market's reserve factor",
                [METRIC.LIQUIDATION_FEES]: "3% of the liquidation incentive goes to the protocol reserves of the liquidated collateral",
            },
            SupplySideRevenue: {
                [METRIC.BORROW_INTEREST]: "Share of borrow interest distributed to lenders who supply assets to the lending pools",
                [METRIC.LIQUIDATION_FEES]: "7% of the Liquidation Incentive is awarded to the liquidator as a bonus",
            },
        },
    } as SimpleAdapter
}

export default moonwellExport({ base: baseUnitroller, moonbeam: moonbeamUnitroller, moonriver: moonriverUnitroller, optimism: optimismUnitroller });