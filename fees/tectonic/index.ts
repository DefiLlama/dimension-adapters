import { FetchOptions, FetchResult, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getFees } from "../../helpers/compoundV2";
import { METRIC } from "../../helpers/metrics";

const comptrollers: Array<string> = [
  '0xb3831584acb95ed9ccb0c11f677b5ad01deaeec0',
  '0x8312A8d5d1deC499D00eb28e1a2723b13aA53C1e',
  '0x7E0067CEf1e7558daFbaB3B1F8F6Fa75Ff64725f',
]

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  
  for (const comptroller of comptrollers) {
    await getFees(comptroller, options, { dailyFees, dailyRevenue })
  }
  
  const dailySupplySideRevenue = dailyFees.clone(1)
  dailySupplySideRevenue.subtract(dailyRevenue, METRIC.BORROW_INTEREST)
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(0.5),
    dailyHoldersRevenue: dailyRevenue.clone(0.5),
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Total interest paid by borrowers",
  Revenue: "Protocol and holders share of interest",
  ProtocolRevenue: "50% of the revenue goes to treasury",
  HoldersRevenue: "50% of the revenue goes to TONIC stakers",
  SupplySideRevenue: "Interest paid to lenders in liquidity pools",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CRONOS],
  methodology,
  start: '2021-12-22'
}

export default adapter;