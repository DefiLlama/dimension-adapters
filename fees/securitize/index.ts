import {Dependencies, FetchOptions, FetchResultFees, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {queryDuneSql} from "../../helpers/dune";
import {gql, GraphQLClient} from "graphql-request";
import {getTokenSupply} from "../../helpers/solana";
import {getBlock} from "../../helpers/getBlock";
import {METRIC} from "../../helpers/metrics";

const EVM_ABI = {
  issue: 'event Issue(address indexed to, uint256 value, uint256 valueLocked)',
  totalSupply: "uint256:totalSupply",
}

// bps Source : https://securitize.io/blackrock/buidl
// Contracts: https://www.blackrock.com/corporate/compliance/scams-and-fraud/resources?referrer=grok.com#blackrock-token-addresses
const EVM_CONTRACTS: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    contracts: [
      {
        address: '0x7712c34205737192402172409a8f7ccef8aa2aec',
        start: '2024-03-01',
      },
      {
        address: '0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041',
        start: '2024-12-17',
      }
    ],
    bps: 50,
  },
  [CHAIN.POLYGON]: {
    contracts: [
      {
        address: '0x2893ef551b6dd69f661ac00f11d93e5dc5dc0e99',
        start: '2024-11-04',
      },
    ],
    bps: 20
  },
  [CHAIN.AVAX]: {
    contracts: [
      {
        address: '0x53fc82f14f009009b440a706e31c9021e1196a2f',
        start: '2024-11-04',
      },
    ],
    bps: 20
  },
  [CHAIN.OPTIMISM]: {
    contracts: [
      {
        address: '0xa1cdab15bba75a80df4089cafba013e376957cf5',
        start: '2024-11-04',
      },
    ],
    bps: 50
  },
  [CHAIN.ARBITRUM]: {
    contracts: [
      {
        address: '0xa6525ae43edcd03dc08e775774dcabd3bb925872',
        start: '2024-11-04',
      },
    ],
    bps: 50
  },
  [CHAIN.BSC]: {
    contracts: [
      {
        address: '0x2d5bdc96d9c8aabbdb38c9a27398513e7e5ef84f',
        start: '2025-10-08',
      },
    ],
    bps: 18
  },
}
const estimateDailyManagementFee = (totalSupply: bigint, bps: number) => {
  return ((totalSupply / BigInt(1e6)) * BigInt(bps)) / 10_000n / 365n;
}
const isWeekend = (timestampSeconds: number) =>
  [0, 6].includes(
    new Date(timestampSeconds * 1000).getUTCDay()
  );


const fetchEvm: any = async (_:any, _1:any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const contract of EVM_CONTRACTS[options.chain].contracts) {


    // estimate management fee
    const totalSupply = await options.fromApi.call({
      target: contract.address,
      abi: EVM_ABI.totalSupply,
      permitFailure: true,
    })
    
    // contract was not deployed yet
    if (!totalSupply) continue;
    
    const mngmtFee = estimateDailyManagementFee(BigInt(totalSupply), EVM_CONTRACTS[options.chain].bps);
    dailyRevenue.addUSDValue(mngmtFee)

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
      dailySupplySideRevenue.addToken(contract.address, e.value)
    })

  }

  const dailyFees = dailyRevenue.clone();
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
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
  const startTs = options.endTimestamp - 32399; // 15:00:00 UTC
  const endTs = options.endTimestamp - 28799; // 16:00:00 UTC
  return [startTs, endTs]
}
const fetchAptos: any = async (_:any, _1:any, options: FetchOptions): Promise<FetchResultFees> => {
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
    const yiedData: IData[] = await queryDuneSql(options, sql)
    if (yiedData[0]?.total_yield) {
      dailySupplySideRevenue.addToken(APTOS_BUIDL_CONTRACT, yiedData[0].total_yield)
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
  const mngmtFee = estimateDailyManagementFee(totalSupply, APTOS_BPS);
  dailyRevenue.addUSDValue(mngmtFee)

  const dailyFees = dailyRevenue.clone();
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
  }
};

const fetchSolana: any = async (_:any, _1:any, options: FetchOptions): Promise<FetchResultFees> => {
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
    const yieldData: IData[] = await queryDuneSql(options, sql)
    if (yieldData[0]?.total_yield) {
      dailySupplySideRevenue.addToken(SOLANA_BUIDL_CONTRACT, yieldData[0].total_yield)
    }
  }


  const totalSupplyUiAmount = await getTokenSupply(SOLANA_BUIDL_CONTRACT);
  // the getTokenSupply helper function returns value in UI amount, we first turn it back with decimals to be consistent with other networks
  const totalSupply = Math.round(totalSupplyUiAmount) * 1e6
  const mngmtFee = estimateDailyManagementFee(BigInt(Math.round(totalSupply)), SOLANA_BPS);
  dailyRevenue.addUSDValue(mngmtFee)
  const dailyFees = dailyRevenue.clone();
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
  }
};

const adapters: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: Object.keys(EVM_CONTRACTS).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetchEvm,
        start: EVM_CONTRACTS[chain].contracts.map((c: {start: string}) => c.start).sort()[0], // return the oldest contract deployment date from array of contracts
      }
    }
  }, {
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      start: '2024-12-17'
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2025-03-24'
    },
  }),
  methodology: {
    Fees: "Total yields generated from the fund's underlying assets (U.S. Treasuries and repo agreements) plus the management fees charged by BlackRock",
    Revenue: "Management fees (20-50 bps depending on the blockchain)",
    SupplySideRevenue: "All yields distributed on-chain to BUIDL token holders after management fees",
  },

  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Gross yields generated from the fund's underlying assets",
      [METRIC.MANAGEMENT_FEES]: "20-50 bps Management fees depending on the blockchain",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "20-50 bps Management fees depending on the blockchain",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Net yields distributed after deducting management fees",
    },
  }
};

export default adapters;
