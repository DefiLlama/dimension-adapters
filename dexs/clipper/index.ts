import * as sdk from "@defillama/sdk";
import { Chain, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

interface ExchangeConfig {
  subgraph?: string;

  // if there is no subgraph, should include the pool list
  pools: Array<string>;

  // include cove pools addresses if any
  coves: Array<string>;
}

type ClipperConfig = {
  [key in Chain]: ExchangeConfig
}


const configs: ClipperConfig = {
  // https://github.com/sushi-labs/clipper-rfq-subgraph/blob/main/scripts/deploy-codegen/networks/mainnet.ts
  // Using event-based fetching for all chains to avoid subgraph reliability issues
  [CHAIN.ETHEREUM]: {
    pools: [],
    coves: [
      '0x44d097113DBEad613fde74b387081FB3b547C54f',
    ],
  },
  [CHAIN.ARBITRUM]: {
    pools: [],
    coves: [
      '0xB873921b1ADd94ea47Bf983B060CE812e97873df',
      '0x9e233dd6a90678baacd89c05ce5c48f43fcc106e',
    ],
  },
  [CHAIN.OPTIMISM]: {
    pools: [],
    coves: [
      '0x93baB043d534FbFDD13B405241be9267D393b827',
    ],
  },
  [CHAIN.POLYGON]: {
    pools: [],
    coves: [
      '0x2370cB1278c948b606f789D2E5Ce0B41E90a756f',
    ],
  },
  [CHAIN.MOONBEAM]: {
    pools: [],
    coves: [],
  },
  [CHAIN.BASE]: {
    pools: [
      '0xb32D856cAd3D2EF07C94867A800035E37241247C',
    ],
    coves: [],
  },
  [CHAIN.MANTLE]: {
    pools: [
      '0x769728b5298445BA2828c0f3F5384227fbF590C5',
    ],
    coves: [],
  },
  [CHAIN.POLYGON_ZKEVM]: {
    pools: [
      '0xae00af61be6861ee956c8e56bf22144d024acb57',
      '0xe38c90a0233f18749fb74e595c4de871e5498c13',
    ],
    coves: [
      '0x097Bf4a933747679698A97A9145Ce2c7f3c46042',
    ],
  },
}

interface IPool {
  id: string
  volumeUSD: string
  feeUSD: string
  revenueUSD: string
}
interface IResponse {
  today: IPool[]
  yesterday: IPool[]
}

const subgraphQuery = gql`
  query fees($fromBlock: Int!, $toBlock: Int!) {
    today: pools(block: {number: $toBlock}) {
      id,
      volumeUSD,
      revenueUSD,
      feeUSD,
    }
    yesterday: pools(block: {number: $fromBlock}) {
      id,
      volumeUSD,
      revenueUSD,
      feeUSD,
    }
  }
`

const fetchSubgraph = async (options: FetchOptions): Promise<FetchResultV2> => {
  const endpoint = configs[options.chain].subgraph as string;
  const toBlock = await options.getToBlock();
  const fromBlock = await options.getFromBlock();

  const response: IResponse = (await request(endpoint, subgraphQuery, {
    fromBlock: fromBlock,
    toBlock: toBlock
  }));

  const dailyVolume = response.today.reduce((acc, pool) => { 
    const id = response.yesterday.find((p) => p.id === pool.id)
    if (!id) return acc
    return acc + Number(pool.volumeUSD) - Number(id.volumeUSD);
  }, 0);

  const dailyFees = response.today.reduce((acc, pool) => {
    const id = response.yesterday.find((p) => p.id === pool.id)
    if (!id) return acc
    return acc + Number(pool.feeUSD) - Number(id.feeUSD);
  }, 0);

  const dailyRevenue = response.today.reduce((acc, pool) => {
    const id = response.yesterday.find((p) => p.id === pool.id)
    if (!id) return acc
    return acc + Number(pool.revenueUSD) - Number(id.revenueUSD);
  },0);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const fetchVolume = async (options: FetchOptions): Promise<sdk.Balances> => {
  const dailyVolume = options.createBalances();

  for (const pool of configs[options.chain].pools) {
    const events = await options.getLogs({
    target: pool,
      eventAbi:
        "event Swapped(address indexed inAsset,address indexed outAsset,address indexed recipient,uint256 inAmount,uint256 outAmount,bytes auxiliaryData)",
    });
    for (const event of events) {
      dailyVolume.add(event.outAsset, event.outAmount)
    }
  }

  for (const pool of configs[options.chain].coves) {
    const events = await options.getLogs({
    target: pool,
      eventAbi:
        "event CoveSwapped(address indexed inAsset,address indexed outAsset,address indexed recipient,uint256 inAmount,uint256 outAmount,bytes32 auxiliaryData)",
    });
    for (const event of events) {
      dailyVolume.add(event.outAsset, event.outAmount)
    }
  }

  return dailyVolume;
};

export const fetchClipperDexs = async (options: FetchOptions): Promise<FetchResultV2> => {
  let results: FetchResultV2 = {}

  if (configs[options.chain].subgraph) {
    results = await fetchSubgraph(options)
  }

  let dailyVolume = results.dailyVolume ? Number(results.dailyVolume) : 0
  const dailyFees = results.dailyFees ? Number(results.dailyFees) : 0

  const additionalVolumes = await fetchVolume(options)
  additionalVolumes.timestamp = options.fromTimestamp
  dailyVolume += await additionalVolumes.getUSDValue()

  return {
    ...results,
    dailyVolume,
    dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchClipperDexs,
      start: '2022-08-05',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchClipperDexs,
      start: '2022-06-29',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchClipperDexs,
      start: '2023-08-02',
    },
     [CHAIN.POLYGON]: {
      fetch: fetchClipperDexs,
      start: '2022-04-20',
    },
    [CHAIN.MOONBEAM]: {
      fetch: fetchClipperDexs,
      start: '2022-08-05',
    },
    [CHAIN.BASE]: {
      fetch: fetchClipperDexs,
      start: '2024-03-16',
    },
    [CHAIN.MANTLE]: {
      fetch: fetchClipperDexs,
      start: '2023-09-07',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: fetchClipperDexs,
      start: '2024-08-22',
    },
  }
}

export default adapter;
