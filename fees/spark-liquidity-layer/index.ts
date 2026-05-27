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

async function fetch(_: any, _1: any, options: FetchOptions): Promise<FetchResultFees> {
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
  Fees: 'Total interest earned on all loans.',
  Revenue: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
  SupplySideRevenue: 'Fees collected distributed to supply-side depositors.',
  ProtocolRevenue: 'All revenue are collected by Spark protocol.',
}

const breakdownMethodology = {
  Fees: {
    'Paypal Yields': 'All yields collected from Paypal PYUSD.',
    'Aave Yields': 'All yields collected from Aave loans.',
    'Anchorage Yields': 'All yields collected from Anchorage.',
    'Morpho Yields': 'All yields collected from Morpho loans.',
    'Curve Yields': 'All yields collected from Curve pools.',
    'Maple Yields': 'All yields collected from Maple loans.',
    'Sparklend Yields': 'All yields collected from Sparklend loans.',
    'Others Yields': 'All yields collected from other sources.',
  },
  Revenue: {
    'Paypal Yields To Spark': 'Spark share of yields collected from Paypal PYUSD.',
    'Aave Yields To Spark': 'Spark share of yields collected from Aave loans.',
    'Anchorage Yields To Spark': 'Spark share of yields collected from Anchorage.',
    'Morpho Yields To Spark': 'Spark share of yields collected from Morpho loans.',
    'Curve Yields To Spark': 'Spark share of yields collected from Curve pools.',
    'Maple Yields To Spark': 'Spark share of yields collected from Maple loans.',
    'Sparklend Yields To Spark': 'Spark share of yields collected from Sparklend loans.',
    'Others Yields To Spark ': 'Spark share of yields collected from other sources.',
  },
  SupplySideRevenue: {
    'Paypal Yields To Suppliers': 'Suppliers share of yields collected from Paypal PYUSD.',
    'Aave Yields To Suppliers': 'Suppliers share of yields collected from Aave loans.',
    'Anchorage Yields To Suppliers': 'Suppliers share of yields collected from Anchorage.',
    'Morpho Yields To Suppliers': 'Suppliers share of yields collected from Morpho loans.',
    'Curve Yields To Suppliers': 'Suppliers share of yields collected from Curve pools.',
    'Maple Yields To Suppliers': 'Suppliers share of yields collected from Maple loans.',
    'Sparklend Yields To Suppliers': 'Suppliers share of yields collected from Sparklend loans.',
    'Others Yields To Suppliers ': 'Suppliers share of yields collected from other sources.',
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
