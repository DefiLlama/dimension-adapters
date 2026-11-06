import { Dependencies, FetchOptions, FetchResultFees, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import { getSqlFromFile, queryDuneSql } from '../../helpers/dune'

function getProtocolName(protocol_name: string): string {
  switch (protocol_name) {
    case 'ALM Proxy': return 'Paypal Yields';
    case 'AAVE': return 'Aave Yields';
    case 'Anchorage': return 'Anchorage Yields';
    case 'Morpho': return 'Morpho Yields';
    case 'Curve': return 'Curve Yields';
    case 'Maple': return 'Maple Yields';
    case 'Sparklend': return 'Sparklend Yields';
  }
  return 'Others Yields';
}

function getLabel(protocol_name: string, options: any): string {
  let label = getProtocolName(protocol_name);
  if (options.r) label += ' To Spark';
  if (options.ssr) label += ' To Suppliers';
  return label;
}

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

async function fetch(options: FetchOptions): Promise<FetchResultFees> {
  const dailyRevenue = options.createBalances()
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const date = getDay(options.startOfDay)
  const sql = getSqlFromFile('fees/spark-liquidity-layer/spark-liquidity-layer-revenue.sql', { dt: date })

  const records = await queryDuneSql(options, sql)

  if (!records || records.length === 0) {
    throw new Error(`No record found for date: ${date}`)
  }

  for (const record of records) {
    // Sparklend rows need the reserve-factor slice from spark_sparklend_actual_revenue_daily; without it the row would double count
    if (record.protocol_name === 'Sparklend' && record.reserve_factor_usd == null) {
      throw new Error(`No Sparklend reserve factor data for ${record.token_symbol} on ${date}`)
    }
    const fees = Number(record.fees || 0)
    const revenue = Number(record.revenue || 0)
    const ssr = Number(record.fees) - Number(record.revenue);
    
    dailyFees.addUSDValue(fees, getLabel(record.protocol_name, {}));
    dailyRevenue.addUSDValue(revenue, getLabel(record.protocol_name, { r: true }));
    dailySupplySideRevenue.addUSDValue(ssr, getLabel(record.protocol_name, { ssr: true }));
  }
  
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue, }
}

const methodology = {
  Fees: "Yield the Spark Liquidity Layer earns on the Sky capital it deploys into lending markets, vaults and pools, after each venue's own cut (for SparkLend, its reserve factor).",
  Revenue: "That yield minus the Sky base rate Spark pays for the capital, plus the monthly rebate on idle USDS.",
  ProtocolRevenue: "Yield on the deployed Sky capital minus the Sky base rate paid for it, plus the monthly rebate on idle USDS, all kept by Spark.",
  SupplySideRevenue: "The Sky base rate paid to Sky for the deployed capital.",
}

const breakdownMethodology = {
  Fees: {
    'Paypal Yields': 'Rewards on PYUSD held directly by the Liquidity Layer.',
    'Aave Yields': 'Yield on capital deployed in Aave.',
    'Anchorage Yields': 'Yield on capital held at Anchorage.',
    'Morpho Yields': 'Yield on capital deployed in Morpho vaults.',
    'Curve Yields': 'Yield on capital deployed in Curve pools.',
    'Maple Yields': 'Yield on capital deployed in Maple.',
    'Sparklend Yields': "Yield on capital deployed in SparkLend, after SparkLend's reserve factor (counted as revenue in the SparkLend listing).",
    'Others Yields': 'Yield on capital deployed elsewhere.',
  },
  Revenue: {
    'Paypal Yields To Spark': 'PYUSD rewards minus the Sky base rate on that capital.',
    'Aave Yields To Spark': 'Aave yield minus the Sky base rate on that capital.',
    'Anchorage Yields To Spark': 'Anchorage yield minus the Sky base rate on that capital.',
    'Morpho Yields To Spark': 'Morpho yield minus the Sky base rate on that capital.',
    'Curve Yields To Spark': 'Curve yield minus the Sky base rate on that capital.',
    'Maple Yields To Spark': 'Maple yield minus the Sky base rate on that capital.',
    'Sparklend Yields To Spark': "SparkLend yield, after SparkLend's reserve factor, minus the Sky base rate on that capital.",
    'Others Yields To Spark': 'Other yield minus the Sky base rate on that capital.',
  },
  SupplySideRevenue: {
    'Paypal Yields To Suppliers': 'Sky base rate paid on the capital held as PYUSD.',
    'Aave Yields To Suppliers': 'Sky base rate paid on the capital deployed in Aave.',
    'Anchorage Yields To Suppliers': 'Sky base rate paid on the capital held at Anchorage.',
    'Morpho Yields To Suppliers': 'Sky base rate paid on the capital deployed in Morpho.',
    'Curve Yields To Suppliers': 'Sky base rate paid on the capital deployed in Curve.',
    'Maple Yields To Suppliers': 'Sky base rate paid on the capital deployed in Maple.',
    'Sparklend Yields To Suppliers': 'Sky base rate paid on the capital deployed in SparkLend.',
    'Others Yields To Suppliers': 'Sky base rate paid on capital deployed elsewhere.',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-04-06',
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
}

export default adapter
