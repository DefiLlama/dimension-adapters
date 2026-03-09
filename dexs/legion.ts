import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const MetricCapitalRaised = 'Capital Raised Fees'
const MetricReferral = 'Referral Fees'

const methodology = {
  Volume: "Total invest volume from investors on all deployed projects on Legion.",
  Fees: "Fees charged on total capital raised and referral fees.",
  Revenue: "Fees charged by Legion on total capital raised collected as revenue.",
  ProtocolRevenue: "Fees charged by Legion on total capital raised collected as revenue.",
  SupplySideRevenue: "Fees distributed to platform referral.",
}

const breakdownMethodology = {
  Fees: {
    [MetricCapitalRaised]: 'Fees chagred on total capital raised.',
    [MetricReferral]: 'Fees distrbiuted to platform referral.',
  },
  Revenue: {
    [MetricCapitalRaised]: 'Fees chagred on total capital raised.',
    [MetricReferral]: 'Fees distrbiuted to platform referral.',
  },
  SupplySideRevenue: {
    [MetricReferral]: 'Fees distrbiuted to platform referral.',
  },
  ProtocolRevenue: {
    [MetricCapitalRaised]: 'Fees chagred on total capital raised.',
    [MetricReferral]: 'Fees distrbiuted to platform referral.',
  },
}

const FACTORY = '0xa0beb0a8c765482c128a2986c063af5c3171ff2f';
const FACTORY_FROM_BLOCK = 23182742;

const ABIS: Record<string, string> = {
  NewPreLiquidSaleV2Created: 'event NewPreLiquidSaleV2Created(address saleInstance, (uint256 salePeriodSeconds, uint256 refundPeriodSeconds, uint256 lockupPeriodSeconds, uint256 legionFeeOnCapitalRaisedBps, uint256 legionFeeOnTokensSoldBps, uint256 referrerFeeOnCapitalRaisedBps, uint256 referrerFeeOnTokensSoldBps, uint256 minimumInvestAmount, address bidToken, address askToken, address projectAdmin, address addressRegistry, address referrerFeeReceiver) saleInitParams, (uint256 vestingDurationSeconds, uint256 vestingCliffDurationSeconds, uint256 tokenAllocationOnTGERate) vestingInitParams)',
  CapitalInvested: 'event CapitalInvested(uint256 amount, address investor, uint256 investTimestamp)',
  CapitalWithdrawn: 'event CapitalWithdrawn(uint256 amountToWithdraw, address projectOwner)',
  saleConfiguration: 'function saleConfiguration() public view returns(uint256 startTime, uint256 endTime, uint256 refundEndTime, uint256 lockupEndTime, uint256 legionFeeOnCapitalRaisedBps, uint256 legionFeeOnTokensSoldBps, uint256 referrerFeeOnCapitalRaisedBps, uint256 referrerFeeOnTokensSoldBps, uint256 minimumInvestAmount)',
}

interface ISale {
  address: string;
  bidToken: string;
  askToken: string;
  legionFeeOnCapitalRaised: number;
  legionFeeOnTokensSold: number;
  referrerFeeOnCapitalRaised: number;
  referrerFeeOnTokensSold: number;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const saleDeployedEvents = await options.getLogs({
    target: FACTORY,
    eventAbi: ABIS.NewPreLiquidSaleV2Created,
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  })
  const saleConfigs = await options.api.multiCall({
    abi: ABIS.saleConfiguration,
    calls: saleDeployedEvents.map((item: any) => item.saleInstance),
  })

  const sales: Array<ISale> = [];
  for (let i = 0; i < saleDeployedEvents.length; i++) {
    sales.push({
      address: saleDeployedEvents[i].saleInstance,
      bidToken: saleDeployedEvents[i].saleInitParams.bidToken,
      askToken: saleDeployedEvents[i].saleInitParams.askToken,
      legionFeeOnCapitalRaised: Number(saleConfigs[i].legionFeeOnCapitalRaisedBps) / 1e4,
      legionFeeOnTokensSold: Number(saleConfigs[i].legionFeeOnTokensSoldBps) / 1e4,
      referrerFeeOnCapitalRaised: Number(saleConfigs[i].referrerFeeOnCapitalRaisedBps) / 1e4,
      referrerFeeOnTokensSold: Number(saleConfigs[i].referrerFeeOnTokensSoldBps) / 1e4,
    })
  }

  const investedEvents = await options.getLogs({
    targets: sales.map(sale => sale.address),
    eventAbi: ABIS.CapitalInvested,
    flatten:false,
  })
  for (let i = 0; i < sales.length; i++) {
    for (const investedEvent of investedEvents[i]) {
      dailyVolume.add(sales[i].bidToken, investedEvent.amount)
    }
  }

  const capitalWithdrawnEvents = await options.getLogs({
    targets: sales.map(sale => sale.address),
    eventAbi: ABIS.CapitalWithdrawn,
    flatten:false,
  })
  for (let i = 0; i < sales.length; i++) {
    for (const capitalWithdrawnEvent of capitalWithdrawnEvents[i]) {
      const legionFee = Number(capitalWithdrawnEvent.amountToWithdraw) * sales[i].legionFeeOnCapitalRaised;
      const referralFee = Number(capitalWithdrawnEvent.amountToWithdraw) * sales[i].referrerFeeOnCapitalRaised;

      dailyFees.add(sales[i].bidToken, legionFee, MetricCapitalRaised)
      dailyFees.add(sales[i].bidToken, referralFee, MetricReferral)
      dailyRevenue.add(sales[i].bidToken, legionFee, MetricCapitalRaised)
      dailySupplySideRevenue.add(sales[i].bidToken, referralFee, MetricReferral)
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-08-21',
    },
  },
};

export default adapter;
