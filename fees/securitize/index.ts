import {Dependencies, FetchOptions, FetchResultFees, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {queryDuneSql} from "../../helpers/dune";
import {gql, GraphQLClient} from "graphql-request";
import {getTokenSupply} from "../../helpers/solana";
import {getBlock} from "../../helpers/getBlock";
import {httpGet} from "../../utils/fetchURL";

const EVM_ABI = {
  issue: 'event Issue(address indexed to, uint256 value, uint256 valueLocked)',
  totalSupply: "uint256:totalSupply",
}

const METRIC = {
  AssetYields: 'BUIDL Underlying Assets Yields.',
  AssetYieldsToLP: 'BUIDL Underlying Assets Yields To LPs.',
  ManagementFeesBuidl: 'Management Fees - BUIDL',
}

type EvmContract = {
  address: string;
  bps?: number;
  dailyAccrualFeed?: string;
}

// bps Source : https://securitize.io/blackrock/buidl
// Contracts: https://www.blackrock.com/corporate/compliance/scams-and-fraud/resources?referrer=grok.com#blackrock-token-addresses
const EVM_CONTRACTS: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    contracts: [
      {
        address: '0x7712c34205737192402172409a8f7ccef8aa2aec',
      },
      {
        address: '0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041',
        bps: 20,
        dailyAccrualFeed: 'BUIDL_I_ETHEREUM_DAILY_ACCRUAL',
      }
    ],
    bps: 50,
    start: '2024-03-01',
  },
  [CHAIN.POLYGON]: {
    contracts: [
      {
        address: '0x2893ef551b6dd69f661ac00f11d93e5dc5dc0e99',
      },
    ],
    bps: 20,
    start: '2024-11-04',
  },
  [CHAIN.AVAX]: {
    contracts: [
      {
        address: '0x53fc82f14f009009b440a706e31c9021e1196a2f',
      },
    ],
    bps: 20,
    start: '2024-11-04',
  },
  [CHAIN.OPTIMISM]: {
    contracts: [
      {
        address: '0xa1cdab15bba75a80df4089cafba013e376957cf5',
      },
    ],
    bps: 50,
    start: '2024-11-04',
  },
  [CHAIN.ARBITRUM]: {
    contracts: [
      {
        address: '0xa6525ae43edcd03dc08e775774dcabd3bb925872',
      },
    ],
    bps: 50,
    start: '2024-11-04',
  },
  [CHAIN.BSC]: {
    contracts: [
      {
        address: '0x2d5bdc96d9c8aabbdb38c9a27398513e7e5ef84f',
      },
    ],
    bps: 18,
    start: '2025-10-08',
  },
}
const SECONDS_PER_DAY = 24 * 60 * 60;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

const getPeriodFraction = (options: FetchOptions, denominator: number) =>
  (options.toTimestamp - options.fromTimestamp) / denominator;

const getSupplyInUsd = (totalSupply: bigint | number | string) => Number(totalSupply) / 1e6;

const estimateManagementFee = (totalSupply: bigint | number | string, bps: number, options: FetchOptions) => {
  return getSupplyInUsd(totalSupply) * (bps / 10_000) * getPeriodFraction(options, SECONDS_PER_YEAR);
}

const getRedstonePrices = (symbol: string, fromTimestamp: number, toTimestamp: number) => {
  const url = `https://api.redstone.finance/prices?symbol=${encodeURIComponent(symbol)}&provider=redstone&limit=1&fromTimestamp=${fromTimestamp * 1000}&toTimestamp=${toTimestamp * 1000}`;
  try {
    return httpGet(`https://api.redstone.finance/prices?symbol=${encodeURIComponent(symbol)}&provider=redstone&limit=1&fromTimestamp=${fromTimestamp * 1000}&toTimestamp=${toTimestamp * 1000}`);
  } catch (e: any) {
    console.log('failed to query', url);
    throw e;
  }
}

const getRedstoneDailyAccrual = async (symbol: string, options: FetchOptions) => {
  const prices = await getRedstonePrices(symbol, options.fromTimestamp, options.toTimestamp);
  if (prices?.[0]?.value == null) throw new Error(`Missing RedStone daily accrual for ${symbol}`);
  return prices[0].value;
}

const isWeekend = (timestampSeconds: number) =>
  [0, 6].includes(
    new Date(timestampSeconds * 1000).getUTCDay()
  );


const fetchEvm: any = async (_:any, _1:any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const contract of EVM_CONTRACTS[options.chain].contracts as EvmContract[]) {


    // estimate management fee
    const totalSupply = await options.fromApi.call({
      target: contract.address,
      abi: EVM_ABI.totalSupply,
      permitFailure: true,
    })
    
    // contract was not deployed yet
    if (!totalSupply) continue;
    
    const mngmtFee = estimateManagementFee(totalSupply, contract.bps ?? EVM_CONTRACTS[options.chain].bps, options);
    dailyFees.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)
    dailyRevenue.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)

    if (contract.dailyAccrualFeed) {
      const dailyAccrual = await getRedstoneDailyAccrual(contract.dailyAccrualFeed, options);
      // The RedStone feed is queried for this adapter's bounded v1 window and is treated as the period's published accrual.
      const yieldForPeriod = getSupplyInUsd(totalSupply) * dailyAccrual * getPeriodFraction(options, SECONDS_PER_DAY);
      dailyFees.addUSDValue(yieldForPeriod, METRIC.AssetYields)
      dailySupplySideRevenue.addUSDValue(yieldForPeriod, METRIC.AssetYieldsToLP)
      continue;
    }

    // Yields are distributed only on business days; skip weekends to avoid unnecessary queries
    if (isWeekend(options.endTimestamp)) {
      continue
    }
    const [startTs, endTs]= getYieldDistributionHours(options)
    const getFromBlock = await getBlock(startTs, options.chain)
    const getToBlock =  await getBlock(endTs, options.chain)
    const issueEvents: Array<any> = await options.getLogs({
      target: contract.address,
      eventAbi: EVM_ABI.issue,
      fromBlock: getFromBlock,
      toBlock: getToBlock,
    })
    issueEvents.forEach(e => {
      dailyFees.addToken(contract.address, e.value, METRIC.AssetYields)
      dailySupplySideRevenue.addToken(contract.address, e.value, METRIC.AssetYieldsToLP)
    })

  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

interface IData {
  total_yield: number;
}
// Limited official docs; based on third-party sources and on-chain patterns:
// Accrual: Daily at 8:00 PM UTC (off-chain) - https://kitchen.steakhouse.financial/p/blackrock-buidl
// Distribution: Next business day ~3:00 PM UTC (on-chain) - https://www.marketsmedia.com/securitize-adds-features-for-blackrock-tokenized-treasury-fund/
// Older sources mentioning the distribution happens monthly. but it has changed to daily -  https://x.com/Securitize/status/1940064769320382487
const getYieldDistributionHours = (options: FetchOptions)=> {
  const distributionDayStart = options.endTimestamp >= options.startOfDay + 16 * 3600
    ? options.startOfDay
    : options.startOfDay - SECONDS_PER_DAY;
  const startTs = distributionDayStart + 15 * 3600; // 15:00:00 UTC
  const endTs = distributionDayStart + 16 * 3600; // 16:00:00 UTC
  return [startTs, endTs]
}
const fetchAptos: any = async (_:any, _1:any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [startTs, endTs]= getYieldDistributionHours(options)
  const APTOS_BUIDL_CONTRACT = '0x50038be55be5b964cfa32cf128b5cf05f123959f286b4cc02b86cafd48945f89'
  const APTOS_GRAPHQL_ENDPOINT = 'https://indexer.mainnet.aptoslabs.com/v1/graphql'
  const APTOS_BPS = 20
  const sql = `
      SELECT SUM(CAST(json_value(data, 'lax $.value') AS DOUBLE)) AS total_yield
      FROM aptos.events
      WHERE event_type = '0x4de5876d8a8e2be7af6af9f3ca94d9e4fafb24b5f4a5848078d8eb08f08e808a::ds_token::Issue'
        AND block_time BETWEEN FROM_UNIXTIME(${startTs}) AND FROM_UNIXTIME(${endTs})
  `

  // Yields are distributed only on business days; skip weekends to avoid unnecessary queries
  if (!isWeekend(options.endTimestamp)) {
    const yiedData = await await queryDuneSql(options, sql) as IData[];
    if (yiedData[0]?.total_yield) {
      dailyFees.addToken(APTOS_BUIDL_CONTRACT, yiedData[0].total_yield, METRIC.AssetYields)
      dailySupplySideRevenue.addToken(APTOS_BUIDL_CONTRACT, yiedData[0].total_yield, METRIC.AssetYieldsToLP)
    }
  }


  const graphQuery = gql`query BUIDLTotalSupply {
  total_supply: current_fungible_asset_balances_aggregate(
    where: { asset_type: { _eq: "${APTOS_BUIDL_CONTRACT}" } }
  ) {
    amount: aggregate {
      sum {
        value: amount
      }
    }
  }
}`
  const totalSupplyData = await new GraphQLClient(APTOS_GRAPHQL_ENDPOINT).request(graphQuery);
  const totalSupply = BigInt(totalSupplyData.total_supply.amount.sum.value);
  const mngmtFee = estimateManagementFee(totalSupply, APTOS_BPS, options);
  dailyFees.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)
  dailyRevenue.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

const fetchSolana: any = async (_:any, _1:any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [startTs, endTs]= getYieldDistributionHours(options)

  const SOLANA_BUIDL_CONTRACT = 'GyWgeqpy5GueU2YbkE8xqUeVEokCMMCEeUrfbtMw6phr'
  const SOLANA_BPS = 20
  const sql = `
      SELECT SUM(amount) AS total_yield
      FROM tokens_solana.transfers
      WHERE token_mint_address = '${SOLANA_BUIDL_CONTRACT}'
        AND action = 'mint'
        AND block_time BETWEEN FROM_UNIXTIME(${startTs}) AND FROM_UNIXTIME(${endTs})
  `
  // Yields are distributed only on business days; skip weekends to avoid unnecessary queries
  if (!isWeekend(options.endTimestamp)) {
    const yieldData = await await queryDuneSql(options, sql) as IData[];
    if (yieldData[0]?.total_yield) {
      dailyFees.addToken(SOLANA_BUIDL_CONTRACT, yieldData[0].total_yield, METRIC.AssetYields)
      dailySupplySideRevenue.addToken(SOLANA_BUIDL_CONTRACT, yieldData[0].total_yield, METRIC.AssetYieldsToLP)
    }
  }


  const totalSupplyUiAmount = await getTokenSupply(SOLANA_BUIDL_CONTRACT);
  // the getTokenSupply helper function returns value in UI amount, we first turn it back with decimals to be consistent with other networks
  const totalSupply = Math.round(totalSupplyUiAmount) * 1e6
  const mngmtFee = estimateManagementFee(Math.round(totalSupply), SOLANA_BPS, options);
  dailyFees.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)
  dailyRevenue.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

const adapters: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    ...Object.fromEntries(
      Object.entries(EVM_CONTRACTS).map(([chain, config]) => [
        chain,
        { ...config, fetch: fetchEvm },
      ])
    ),
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      start: '2024-12-17',
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2025-03-24',
    },
  },
  methodology: {
    Fees: "Total yields generated from the fund's underlying assets (U.S. Treasuries and repo agreements) plus the management fees charged by BlackRock",
    Revenue: "Management fees (18-50 bps depending on the blockchain and BUIDL share class)",
    ProtocolRevenue: "Management fees (18-50 bps depending on the blockchain and BUIDL share class)",
    SupplySideRevenue: "All yields distributed on-chain to BUIDL token holders after management fees",
  },

  breakdownMethodology: {
    Fees: {
      [METRIC.AssetYields]: "Gross yields generated from the fund's underlying assets",
      [METRIC.ManagementFeesBuidl]: "18-50 bps Management fees depending on the blockchain and BUIDL share class",
    },
    Revenue: {
      [METRIC.ManagementFeesBuidl]: "18-50 bps Management fees depending on the blockchain and BUIDL share class",
    },
    ProtocolRevenue: {
      [METRIC.ManagementFeesBuidl]: "18-50 bps Management fees depending on the blockchain and BUIDL share class",
    },
    SupplySideRevenue: {
      [METRIC.AssetYieldsToLP]: "Net yields distributed after deducting management fees",
    },
  }
};

export default adapters;
