import * as sdk from "@defillama/sdk";
import { BreakdownAdapter, BaseAdapter, FetchOptions, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { queryDuneSql } from "../helpers/dune";
import { getUniV3LogAdapter } from "../helpers/uniswap";

/*
QuickSwap Fee Structure History:

V2 (Uniswap v2 fork):
- Fee: 0.3% (fixed since inception)
- Split: 83.33% to LPs (0.25%), 13.33% to community (0.04%), 3.33% to foundation (0.01%)
- Never changed

V3 (Algebra/Uniswap v3 fork):
- Fee: Dynamic (varies by pool)
- Fee Percentage Changes:
  
  Before March 1, 2025:
  - Total Revenue: 10% of collected fees
  - Split: 85% to LPs, 6.8% to community (buybacks), 1.7% to foundation, 1.5% to Algebra Labs
  
  After March 1, 2025 (Governance Change):
  - Total Revenue: 15% of collected fees  
  - Split: 85% to LPs, 10% to community (buybacks), 3.23% to foundation, 1.77% to Algebra Labs
  
  Uni Forks (IMX, Manta):
  - Total Revenue: 10% of collected fees
  - Split: 90% to LPs, 7% to community, 3% to foundation

*/

const v2Endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint("FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd"),
};

const v2Graph = getGraphDimensions2({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    ProtocolRevenue: 0.01,
    SupplySideRevenue: 0.25,
    HoldersRevenue: 0.04,
    Revenue: 0.05,
    Fees: 0.3,
  },
});

const config_v3: Record<string, { datasource: string, url: string, start: string, startBlock?: number }> = {
  [CHAIN.POLYGON]: {
    datasource: 'dune',
    url: sdk.graph.modifyEndpoint("FqsRcH1XqSjqVx9GRTvEJe959aCbKrcyGgDWBrUkG24g"),
    start: '2022-09-06',
    startBlock: 32610688
  },
  // [CHAIN.DOGECHAIN]: {
  //   datasource: 'algebra',
  //   url: "https://graph-node.dogechain.dog/subgraphs/name/quickswap/dogechain-info",
  // },
  [CHAIN.POLYGON_ZKEVM]: {
    datasource: 'algebra',
    url: sdk.graph.modifyEndpoint("3L5Y5brtgvzDoAFGaPs63xz27KdviCdzRuY12spLSBGU"),
    start: '2023-03-27',
  },
  [CHAIN.SONEIUM]: {
    datasource: 'algebra',
    url: sdk.graph.modifyEndpoint("3GsT6AiuDiSzh2fXbFxUKtBxT8rBEGVdQCgHSsKMPHiu"),
    start: '2025-01-10',
  },
  [CHAIN.IMX]: {
    datasource: 'v3',
    url:  "https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap-IMX/prod/gn",
    start: '2023-12-19',
  },
  [CHAIN.MANTA]: {
    datasource: 'v3',
    url: 'https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap/prod/gn',
    start: '2023-10-19'
  }
}

const v3Endpoints = Object.entries(config_v3)
  .filter(([_, chain]) => chain.datasource === 'v3')
  .reduce((acc, [chain, data]) => ({...acc, [chain]: data.url}), {} as Record<string, string>)

const algebraEndpoints = Object.entries(config_v3)
  .filter(([_, chain]) => chain.datasource === 'algebra')
  .reduce((acc, [chain, data]) => ({...acc, [chain]: data.url}), {} as Record<string, string>)

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
  },
});

// Function to get correct fee percentages based on timestamp and chain
const getV3FeePercentages = (timestamp: number, chain: string) => {
  const march1st2025 = 1740787200; // March 1, 2025 UTC timestamp
  
  // For uni forks like IMX, use 10% total revenue structure
  if (config_v3[chain].datasource === 'v3') {
    return {
      ProtocolRevenue: 3,
      HoldersRevenue: 7,
      SupplySideRevenue: 90,
      UserFees: 100,
      Revenue: 10,
    };
  }
  
  // For main chains like Polygon
  if (timestamp < march1st2025) {
    // Before March 1, 2025: 10% total revenue
    return {
      ProtocolRevenue: 1.7,
      HoldersRevenue: 6.8, // Community fee (buybacks)
      SupplySideRevenue: 85,
      UserFees: 100,
      Revenue: 8.5, // 1.7 + 6.8 (ignoring Algebra Labs 1.5%)
    };
  } else {
    // After March 1, 2025: 15% total revenue  
    return {
      ProtocolRevenue: 3.23,
      HoldersRevenue: 10, // Community fee (buybacks)
      SupplySideRevenue: 85,
      UserFees: 100,
      Revenue: 13.23, // 3.23 + 10 (ignoring Algebra Labs 1.77%)
    };
  }
};

const algebraGraphs = getGraphDimensions2({
  graphUrls: algebraEndpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees"
  },
});


const fetchv2Graph = async (_a:any, _b:any, options: FetchOptions) => {
  return await v2Graph(options)
}

const fetchv3GraphEndpoint = async (options: FetchOptions) => {
  return (await v3Graphs(options))
}

const fetchv3AlgebraGraphEndpoint = async (options: FetchOptions) => {
  return await algebraGraphs(options)
}

const fetchv3PolygonLogs = async (options: FetchOptions): Promise<{ dailyFees: number }> => {
  const factory = "0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28"
  const poolCreatedEvent = 'event Pool(address indexed token0, address indexed token1, address pool)'
  const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)'
  const FeeEvent = 'event Fee(uint16 fee)'

  const fromBlock = config_v3[options.chain]?.startBlock || 0
  const toBlock = await options.getToBlock()

  const adapter = getUniV3LogAdapter({
    factory: factory,
    poolCreatedEvent: poolCreatedEvent,
    swapEvent: swapEvent,
  })
  const { dailyVolume } = await adapter(options)

  const pool_created_events = await options.getLogs({
    target: factory,
    eventAbi: poolCreatedEvent,
    fromBlock: fromBlock,
    toBlock: toBlock,
  })

  const fee_events = await options.getLogs({
    noTarget: true,
    eventAbi: FeeEvent,
    topic: '0x598b9f043c813aa6be3426ca60d1c65d17256312890be5118dab55b0775ebe2a',
    entireLog: true,
    parseLog: true,
  })

  const raw_poolIds = pool_created_events.map((pool) => pool.pool)
  const fee_total = fee_events.reduce((acc, fee) => {
    if (raw_poolIds.includes(fee.args.contract_address)) {
      return acc + Number(fee.args.fee) / 1e6
    }
    return acc
  }, 0)
  const dailyFees = dailyVolume * fee_total

  return {
    dailyFees,
  }
}

const fetchV3Dune = async (options: FetchOptions) => {
  const query = `
    with quickswap_trades as (
        select
            block_time
            , amount_usd
            , project_contract_address
            from dex.trades
            where project = 'quickswap'
           and version = '3'
           and blockchain = '${options.chain.toLowerCase()}'
           AND block_time >= from_unixtime(${options.startTimestamp})
           AND block_time <= from_unixtime(${options.endTimestamp})
    )
    select
        sum(amount_usd) as dailyVolume
        , sum(amount_usd * fee / 1e6) as dailyFees
    from quickswap_trades t
        left join quickswap_v3_${options.chain.toLowerCase()}.algebrapool_evt_fee f on t.project_contract_address = f.contract_address
       and t.block_time = f.evt_block_time
  `
  const chainData = await queryDuneSql(options, query)
  const dailyFees = Number(chainData[0]["dailyFees"]) || 0
  const dailyVolume = Number(chainData[0]["dailyVolume"]) || 0

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyVolume,
  }
 
}

const getDailyFees = async (options: FetchOptions) => {
  const chain_config = config_v3[options.chain]
  if (chain_config.datasource === 'algebra') {
    return await fetchv3AlgebraGraphEndpoint(options)
  } else if (chain_config.datasource === 'logs') {
    return await fetchv3PolygonLogs(options)
  } else if (chain_config.datasource === 'dune') {
    return await fetchV3Dune(options)
  } else {
    return await fetchv3GraphEndpoint(options)
  }
}

const fetchv3Graph = async (_a:any, _b:any, options: FetchOptions) => {
  const { dailyFees } = await getDailyFees(options)
  const daily_fees = Number(dailyFees)
  // Apply dynamic fee percentages based on timestamp and chain
  const feePercentages = getV3FeePercentages(options.startTimestamp, options.chain)
  
  return {
    dailyFees: daily_fees,
    dailyUserFees: daily_fees,
    dailyRevenue: daily_fees * (feePercentages.Revenue / 100),
    dailyProtocolRevenue: daily_fees * (feePercentages.ProtocolRevenue / 100),
    dailySupplySideRevenue: daily_fees * (feePercentages.SupplySideRevenue / 100),
    dailyHoldersRevenue: daily_fees * (feePercentages.HoldersRevenue / 100),
  }
}


const adapter: BreakdownAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  breakdown: {
    v2: {
      [CHAIN.POLYGON]: {
        fetch: fetchv2Graph,
        start: '2020-10-08',
      },
    },
    v3: Object.keys(config_v3).reduce((acc, chain) => {
      acc[chain] = {
        fetch: fetchv3Graph,
        start: config_v3[chain].start,
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
