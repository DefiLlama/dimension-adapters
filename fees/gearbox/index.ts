import { METRIC } from "../../helpers/metrics";
import { formatAddress } from "../../utils/utils";
import { BaseAdapterChainConfig, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { Balances } from "@defillama/sdk";
import { GearboxAbis, GearboxConfigs, IGearboxService } from "./configs";

const ONE_ETHER_IN_WEI = 1e18
const ONE_RAY_IN_WEI = 1e27
const PERCENTAGE_FACTOR = 1e4
const INTEREST_FEE = 0.0025 // 0.25%

interface PrcessBalances {
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailySupplySideRevenue: Balances;
}

async function processV2Services(options: FetchOptions, balances: PrcessBalances, services: Array<IGearboxService>) {
  if (services.length > 0) {
    const underlyingTokens = await options.api.multiCall({
      abi: 'address:underlyingToken',
      calls: services.map(service => service.pool),
      permitFailure: true,
    })
    const dieselTokens = await options.api.multiCall({
      abi: 'address:dieselToken',
      calls: services.map(service => service.pool),
      permitFailure: true,
    })
    const fees = await options.api.multiCall({
      abi: 'function fees() view returns (uint16 feeInterest, uint16 feeLiquidation, uint16 liquidationDiscount, uint16 feeLiquidationExpired, uint16 liquidationDiscountExpired)',
      calls: services.map(service => service.creditManager as string),
      permitFailure: true,
    })

    const dieselSupplies = await options.api.multiCall({
      abi: 'uint256:totalSupply',
      calls: dieselTokens,
      permitFailure: true,
    })
    const dieselPrices = await options.api.multiCall({
      abi: 'function fromDiesel(uint256) view returns (uint256)',
      calls: services.map(service => service.pool).map((address: string) => { return { target: address, params: [String(ONE_ETHER_IN_WEI)] } }),
      permitFailure: true,
    })

    const dieselCumulativeIndexBefore = await options.fromApi.multiCall({
      abi: 'uint256:_cumulativeIndex_RAY',
      calls: services.map(service => service.pool),
      permitFailure: true,
    })
    const dieselCumulativeIndexAfter = await options.toApi.multiCall({
      abi: 'uint256:_cumulativeIndex_RAY',
      calls: services.map(service => service.pool),
      permitFailure: true,
    })

    // count interest from growth CumulativeIndex for fees and supplySideRevenue
    for (let i = 0; i < services.length; i++) {
      const token = underlyingTokens[i]
      const { feeInterest } = fees[i]
      if (token) {
        const totalTokenBalance = Number(dieselSupplies[i]) * Number(dieselPrices[i]) / ONE_ETHER_IN_WEI
        const growthCumulativeIndex = Number(dieselCumulativeIndexAfter[i]) - Number(dieselCumulativeIndexBefore[i])
        const growthInterest = growthCumulativeIndex * totalTokenBalance / ONE_RAY_IN_WEI  

        const protocolInterestFee = Number(growthInterest) * Number(feeInterest) / PERCENTAGE_FACTOR
        const supplySideInterest = Number(growthInterest) - protocolInterestFee

        // we count growthInterest as fees
        balances.dailyFees.add(token, growthInterest, METRIC.BORROW_INTEREST)
        balances.dailySupplySideRevenue.add(token, supplySideInterest, METRIC.BORROW_INTEREST)
        balances.dailyRevenue.add(token, protocolInterestFee, METRIC.BORROW_INTEREST)
        balances.dailyProtocolRevenue.add(token, protocolInterestFee, METRIC.BORROW_INTEREST)
      }
    }

    // when credit managers repay loans, there are profit or loss
    // protocol collects profits as revenue and will pay for loss
    const repayEvents = await options.getLogs({
      eventAbi: GearboxAbis.PoolRepay,
      targets: services.map(service => service.pool),
      flatten: false,
    });
    for (let i = 0; i < services.length; i++) {
      const token = underlyingTokens[i];
      const events = repayEvents[i];
      for (const event of events) {
        balances.dailyFees.add(token, Number(event.profit), 'Performance Profit')
        balances.dailyFees.add(token, Number(event.loss), 'Performance Loss')
        balances.dailyRevenue.add(token, Number(event.profit), 'Performance Profit')
        balances.dailyRevenue.add(token, Number(event.loss), 'Performance Loss')
        balances.dailyProtocolRevenue.add(token, Number(event.profit), 'Performance Profit')
        balances.dailyProtocolRevenue.add(token, Number(event.loss), 'Performance Loss')
      }
    }
  }
}

async function processV3Services(options: FetchOptions, balances: PrcessBalances, services: Array<IGearboxService>) {
  const assets = await options.api.multiCall({
    abi: 'address:asset',
    calls: services.map(service => service.pool),
    permitFailure: true,
  })
  const totalAssets = await options.api.multiCall({
    abi: 'uint256:totalAssets',
    calls: services.map(service => service.pool),
    permitFailure: true,
  })
  const decimals = await options.api.multiCall({
    abi: 'uint8:decimals',
    calls: services.map(service => service.pool),
    permitFailure: true,
  })

  const cumulativeIndexBefore = await options.fromApi.multiCall({
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    calls: services.map((service, index) => {
      return {
        target: service.pool,
        params: [String(10**Number(decimals[index]))],
      }
    }),
    permitFailure: true,
  })
  const cumulativeIndexAfter = await options.toApi.multiCall({
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    calls: services.map((service, index) => {
      return {
        target: service.pool,
        params: [String(10**Number(decimals[index]))],
      }
    }),
    permitFailure: true,
  })

  // count interest from growth CumulativeIndex for fees and supplySideRevenue
  for (let i = 0; i < services.length; i++) {
    const token = assets[i]
    if (token) {
      const totalTokenBalance = Number(totalAssets[i])
      const growthCumulativeIndex = Number(cumulativeIndexAfter[i]) - Number(cumulativeIndexBefore[i])
      const growthInterest = growthCumulativeIndex * totalTokenBalance / (10**Number(decimals[i]))
      const growthInterestFee = growthInterest * INTEREST_FEE

      // we count growthInterest as fees
      balances.dailyFees.add(token, growthInterest, METRIC.BORROW_INTEREST)
      balances.dailySupplySideRevenue.add(token, growthInterest - growthInterestFee, METRIC.BORROW_INTEREST)

      // revenue source 1: from borrow interest share
      balances.dailyRevenue.add(token, growthInterestFee, METRIC.BORROW_INTEREST)
      balances.dailyProtocolRevenue.add(token, growthInterestFee, METRIC.BORROW_INTEREST)
    }
  }

  
  //
  // revenue source 2: from profit & loss
  // when credit managers repay loans, there are profit or loss
  // protocol collects profits as revenue and will pay for loss
  //
  const repayEvents = await options.getLogs({
    eventAbi: GearboxAbis.PoolRepay,
    targets: services.map(service => service.pool),
    flatten: false,
  });

  for (let i = 0; i < services.length; i++) {
    const token = assets[i];
    const events = repayEvents[i];
    for (const event of events) {
      // we add profit & loss to revenue
      balances.dailyFees.add(token, Number(event.profit), 'Performance Profit')
      balances.dailyFees.add(token, Number(event.loss), 'Performance Loss')
      balances.dailyRevenue.add(token, Number(event.profit), 'Performance Profit')
      balances.dailyRevenue.add(token, Number(event.loss), 'Performance Loss')
      balances.dailyProtocolRevenue.add(token, Number(event.profit), 'Performance Profit')
      balances.dailyProtocolRevenue.add(token, Number(event.loss), 'Performance Loss')
    }
  }
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const config = GearboxConfigs[options.chain]
  
  await processV2Services(options, { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }, config.services.filter(service => service.version === 2))
  await processV3Services(options, { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }, config.services.filter(service => service.version === 3))

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue: 0 }
}

const methodology = {
  Fees: 'Include borrow interest, performance profit & loss and liquidation fee paid by borrowers.',
  Revenue: 'Amount of fees go to Gearbox treasury.',
  SupplySideRevenue: 'Amount of fees distributed to passive lenders.',
  ProtocolRevenue: 'Amount of fees go to Gearbox treasury.',
  HoldersRevenue: 'No revenue share to GEAR token holders.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all credit accounts (exclude performance profit and loss).',
    'Performance Profit': 'All profit from performance paid by credit accounts.',
    'Performance Loss': 'All loss from credit accounts paid by Gearbox treasury.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest were paid by credit accounts to passive lenders.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest collected by Gearbox treasury.',
    'Performance Profit': 'Gearbox treasury collects performance profit paid by credit accounts.',
    'Performance Loss': 'Gearbox treasury paid for loss from credit accounts.',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest collected by Gearbox treasury.',
    'Performance Profit': 'Gearbox treasury collects performance profit paid by credit accounts.',
    'Performance Loss': 'Gearbox treasury paid for loss from credit accounts.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  fetch,
  chains: Object.keys(GearboxConfigs),
  adapter: {},

  // when credit accounts repay loans, if repaid amount exceeds loans, remaining amount will be taken as profit for treasury
  // if repaid amount is not enough to cover loans, tresury transfer funds to cover the loss
  allowNegativeValue: true,
}

for (const [chain, config] of Object.entries(GearboxConfigs)) {
  (adapter.adapter as BaseAdapterChainConfig)[chain] = {
    start: config.start,
  }
}

export default adapter;
