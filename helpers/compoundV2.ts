import ADDRESSES from './coreAssets.json'
import { BaseAdapter, Fetch, FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import * as sdk from "@defillama/sdk";
import { METRIC } from './metrics';

const LiquidateBorrowEvent = 'event LiquidateBorrow(address liquidator, address borrower, uint256 repayAmount, address cTokenCollateral, uint256 seizeTokens)'

const comptrollerABI = {
  underlying: "address:underlying",
  getAllMarkets: "address[]:getAllMarkets",
  accrueInterest: "event AccrueInterest(uint256 cashPrior,uint256 interestAccumulated,uint256 borrowIndex,uint256 totalBorrows)",
  reserveFactor: "uint256:reserveFactorMantissa",
  exchangeRateStored: "uint256:exchangeRateStored",
  totalSupply: "uint256:totalSupply",
};

export async function getFees(market: string, { createBalances, api, getLogs, }: FetchOptions, {
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
  const underlyings = await api.multiCall({ calls: markets, abi: comptrollerABI.underlying, permitFailure: true, });
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

  logs.forEach((log: any) => {
    const marketIndex = log.marketIndex;
    const underlying = underlyings[marketIndex]
    dailyFees!.add(underlying, log.interestAccumulated, METRIC.BORROW_INTEREST);
    dailyRevenue!.add(underlying, log.interestAccumulated * Number(reserveFactors[marketIndex]) / 1e18, METRIC.BORROW_INTEREST);
  })

  return { dailyFees, dailyRevenue }
}

export async function getFeesUseExchangeRates(market: string, { createBalances, api, fromApi, toApi, }: FetchOptions, {
  dailyFees,
  dailyRevenue,
  abis = {},
  blacklists = [],
}: {
  dailyFees?: sdk.Balances,
  dailyRevenue?: sdk.Balances,
  abis?: any,
  blacklists?: Array<string>,
}) {
  if (!dailyFees) dailyFees = createBalances()
  if (!dailyRevenue) dailyRevenue = createBalances()
  
  // filter out blacklists markets - cTokens
  let markets = await api.call({ target: market, abi: comptrollerABI.getAllMarkets, })
  markets = markets.filter((m: string) => (!blacklists || !blacklists.includes(String(m).toLowerCase())))
  
  const underlyings = await api.multiCall({ calls: markets, abi: comptrollerABI.underlying, permitFailure: true, });
  underlyings.forEach((underlying, index) => {
    if (!underlying) underlyings[index] = ADDRESSES.null
  })
  const reserveFactors = await api.multiCall({ calls: markets, abi: abis.reserveFactor ?? comptrollerABI.reserveFactor, });
  
  const marketExchangeRatesBefore = await fromApi.multiCall({ calls: markets, abi: comptrollerABI.exchangeRateStored, });
  const marketExchangeRatesAfter = await toApi.multiCall({ calls: markets, abi: comptrollerABI.exchangeRateStored, });
  const totalSupplies = await toApi.multiCall({ calls: markets, abi: comptrollerABI.totalSupply, });
  const underlyingDecimals = await toApi.multiCall({ calls: underlyings, abi: 'uint8:decimals', permitFailure: true });
  
  for (let i = 0; i < markets.length; i++) {
    const underlying = underlyings[i];
    const underlyingDecimal = Number(underlyingDecimals[i] ? underlyingDecimals[i] : 18);
    const reserveFactor = reserveFactors[i];
    const rateGrowth = Number(marketExchangeRatesAfter[i]) - Number(marketExchangeRatesBefore[i])
    if (rateGrowth > 0) {
      const mantissa = 18 + underlyingDecimal - 8
      const interestAccumulated = rateGrowth * Number(totalSupplies[i]) * (10 ** underlyingDecimal) / (10 ** mantissa) / 1e8
      const revenueAccumulated = interestAccumulated * reserveFactor / 1e18
      
      dailyFees!.add(underlying, interestAccumulated, METRIC.BORROW_INTEREST);
      dailyRevenue!.add(underlying, revenueAccumulated, METRIC.BORROW_INTEREST);
    }
  }

  return { dailyFees, dailyRevenue }
}

export function getFeesExport(market: string) {
  return (async (timestamp: number, _: any, options: FetchOptions) => {
    const { dailyFees, dailyRevenue } = await getFees(market, options, {})
    const dailyHoldersRevenue = dailyRevenue
    const dailySupplySideRevenue = options.createBalances()
    dailySupplySideRevenue.addBalances(dailyFees)
    Object.entries(dailyRevenue.getBalances()).forEach(([token, balance]) => {
      dailySupplySideRevenue.addTokenVannila(token, Number(balance) * -1)
    })
    return { timestamp, dailyFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue }
  }) as Fetch
}

interface CompoundV2ExportOptions {
  blacklists?: Array<string>;
  useExchangeRate?: boolean;
  protocolRevenueRatio?: number;
  holdersRevenueRatio?: number;
  methodology?: string | IJSON<string>;
  breakdownMethodology?: Record<string, string | IJSON<string>>;
}

export function compoundV2Export(config: IJSON<string>, exportOptions?: CompoundV2ExportOptions) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, market]) => {
    exportObject[chain] = {
      fetch: (async (options: FetchOptions) => {
        const { dailyFees, dailyRevenue } = exportOptions && exportOptions.useExchangeRate 
          ? await getFeesUseExchangeRates(market, options, {
            blacklists: exportOptions.blacklists,
          }) 
          : await getFees(market, options, {})
        const dailyProtocolRevenue = exportOptions && exportOptions.protocolRevenueRatio !== undefined ? dailyRevenue.clone(exportOptions.protocolRevenueRatio) : undefined
        const dailyHoldersRevenue = exportOptions && exportOptions.holdersRevenueRatio !== undefined ? dailyRevenue.clone(exportOptions.holdersRevenueRatio) : undefined
        const dailySupplySideRevenue = options.createBalances()
        dailySupplySideRevenue.addBalances(dailyFees)
        Object.entries(dailyRevenue.getBalances()).forEach(([token, balance]) => {
          dailySupplySideRevenue.addTokenVannila(token, Number(balance) * -1, METRIC.BORROW_INTEREST)
        })
        return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
      }),
    }
  })
  return {
    adapter: exportObject,
    version: 2,
    methodology: exportOptions && exportOptions.methodology ? exportOptions.methodology : {
      Fees: "Total interest paid by borrowers",
      Revenue: "Protocol and holders share of interest",
      ProtocolRevenue: "Protocol's share of interest into treasury",
      HoldersRevenue: "Share of interest into protocol governance token holders.",
      SupplySideRevenue: "Interest paid to lenders in liquidity pools"
    },
    breakdownMethodology: exportOptions && exportOptions.breakdownMethodology ? exportOptions.breakdownMethodology : {
      Fees: {
        [METRIC.BORROW_INTEREST]: 'Total interest paid by borrowers',
      },
      Revenue: {
        [METRIC.BORROW_INTEREST]: 'Share of borrow interest to treasury',
      },
      ProtocolRevenue: {
        [METRIC.BORROW_INTEREST]: 'Share of borrow interest to protocol',
      },
      HoldersRevenue: {
        [METRIC.BORROW_INTEREST]: 'Share of borrow interest to token holders',
      },
      SupplySideRevenue: {
        [METRIC.BORROW_INTEREST]: 'Borrow interest distributed to suppliers, lenders',
      },
    },
  } as SimpleAdapter
}

export function compoundV2LiquidationsExport(
  config: { [chain: string]: { comptroller: string; start: string } },
  { pullHourly = true, ...otherRootOptions }: {
    pullHourly?: boolean
    [key: string]: any
  } = {},
): SimpleAdapter {
  const exportObject: BaseAdapter = {}

  Object.entries(config).forEach(([chain, { comptroller, start }]) => {
    exportObject[chain] = {
      fetch: async (options: FetchOptions) => {
        const dailyLiquidations = options.createBalances()
        const dailyLiquidatedDebt = options.createBalances()

        const cTokens: string[] = await options.api.call({
          target: comptroller,
          abi: comptrollerABI.getAllMarkets,
        })

        const underlyings = await options.api.multiCall({
          abi: comptrollerABI.underlying,
          calls: cTokens,
          permitFailure: true,
        })

        const underlyingMap: Record<string, string> = {}
        for (let i = 0; i < cTokens.length; i++) {
          underlyingMap[cTokens[i].toLowerCase()] = underlyings[i] ?? ADDRESSES.null
        }

        const exchangeRates = await options.api.multiCall({
          abi: comptrollerABI.exchangeRateStored,
          calls: cTokens,
          permitFailure: true,
        })

        const exchangeRateMap: Record<string, bigint> = {}
        for (let i = 0; i < cTokens.length; i++) {
          if (exchangeRates[i]) {
            exchangeRateMap[cTokens[i].toLowerCase()] = BigInt(exchangeRates[i])
          }
        }

        for (const cToken of cTokens) {
          const events: any[] = await options.getLogs({
            target: cToken,
            eventAbi: LiquidateBorrowEvent,
          })
          if (events.length === 0) continue

          const debtUnderlying = underlyingMap[cToken.toLowerCase()]
          if (!debtUnderlying) continue

          for (const event of events) {
            dailyLiquidatedDebt.add(debtUnderlying, event.repayAmount)

            const collateralCToken = event.cTokenCollateral.toLowerCase()
            const collateralUnderlying = underlyingMap[collateralCToken]
            const exchangeRate = exchangeRateMap[collateralCToken]
            if (collateralUnderlying && exchangeRate) {
              const underlyingAmount = (BigInt(event.seizeTokens) * exchangeRate) / BigInt(1e18)
              dailyLiquidations.add(collateralUnderlying, underlyingAmount)
            }
          }
        }

        return { dailyLiquidations, dailyLiquidatedDebt }
      },
      start,
    }
  })

  return {
    ...otherRootOptions,
    version: 2,
    pullHourly,
    adapter: exportObject,
    methodology: {
      Liquidations: 'Total USD value of collateral seized in LiquidateBorrow events, converted from cToken units to underlying via exchangeRateStored.',
      LiquidatedDebt: 'Total USD value of debt repaid by liquidators in LiquidateBorrow events.',
    },
  } as SimpleAdapter
}