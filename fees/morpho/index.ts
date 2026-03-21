import { request } from "graphql-request";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

interface MorphoBlueConfig {
  chainId?: number;
  blue: string;
  start: string;
  fromBlock?: number;
}

const MorphoBlues: Record<string, MorphoBlueConfig> = {
  [CHAIN.ETHEREUM]: {
    chainId: 1,
    blue: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb",
    start: "2024-01-02",
  },
  [CHAIN.BASE]: {
    chainId: 8453,
    blue: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb",
    start: "2024-05-03",
  },
  [CHAIN.POLYGON]: {
    chainId: 137,
    blue: "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67",
    start: "2025-01-20",
  },
  [CHAIN.UNICHAIN]: {
    chainId: 130,
    blue: "0x8f5ae9cddb9f68de460c77730b018ae7e04a140a",
    start: "2025-02-18",
  },
  [CHAIN.KATANA]: {
    chainId: 747474,
    blue: "0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc",
    start: "2025-07-01",
  },
  [CHAIN.ARBITRUM]: {
    chainId: 42161,
    blue: "0x6c247b1F6182318877311737BaC0844bAa518F5e",
    start: "2025-01-18",
  },
  [CHAIN.FRAXTAL]: {
    fromBlock: 15317931,
    blue: "0xa6030627d724bA78a59aCf43Be7550b4C5a0653b",
    start: "2025-01-22",
  },
  [CHAIN.INK]: {
    fromBlock: 4078776,
    blue: "0x857f3EefE8cbda3Bc49367C996cd664A880d3042",
    start: "2025-01-25",
  },
  [CHAIN.OPTIMISM]: {
    fromBlock: 130770075,
    blue: "0xce95AfbB8EA029495c66020883F87aaE8864AF92",
    start: "2025-01-18",
  },
  [CHAIN.SCROLL]: {
    fromBlock: 12842868,
    blue: "0x2d012EdbAdc37eDc2BC62791B666f9193FDF5a55",
    start: "2025-01-22",
  },
  [CHAIN.WC]: {
    fromBlock: 12842868,
    blue: "0xE741BC7c34758b4caE05062794E8Ae24978AF432",
    start: "2025-01-22",
  },
  [CHAIN.MODE]: {
    fromBlock: 19983370,
    blue: "0xd85cE6BD68487E0AaFb0858FDE1Cd18c76840564",
    start: "2025-02-22",
  },
  [CHAIN.CORN]: {
    fromBlock: 251401,
    blue: "0xc2B1E031540e3F3271C5F3819F0cC7479a8DdD90",
    start: "2025-02-22",
  },
  [CHAIN.HEMI]: {
    fromBlock: 1188872,
    blue: "0xa4Ca2c2e25b97DA19879201bA49422bc6f181f42",
    start: "2025-02-22",
  },
  [CHAIN.SONIC]: {
    fromBlock: 9100931,
    blue: "0xd6c916eB7542D0Ad3f18AEd0FCBD50C582cfa95f",
    start: "2025-02-22",
  },
  [CHAIN.HYPERLIQUID]: {
    fromBlock: 1988429,
    blue: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    start: "2025-04-04",
  },
  [CHAIN.SONEIUM]: {
    fromBlock: 6440817,
    blue: "0xE75Fc5eA6e74B824954349Ca351eb4e671ADA53a",
    start: "2025-05-01",
  },
  [CHAIN.ZIRCUIT]: {
    fromBlock: 14640172,
    blue: "0xA902A365Fe10B4a94339B5A2Dc64F60c1486a5c8",
    start: "2025-06-07",
  },
  [CHAIN.MONAD]: {
    fromBlock: 31907457,
    blue: "0xD5D960E8C380B724a48AC59E2DfF1b2CB4a1eAee",
    start: "2025-11-23",
  },
  // [CHAIN.STABLE]: {
  //   fromBlock: 4342501,
  //   blue: "0xa40103088A899514E3fe474cD3cc5bf811b1102e",
  //   start: "2025-12-08",
  // },
  // [CHAIN.TAC]: {
  //   fromBlock: 853025,
  //   blue: "0x918B9F2E4B44E20c6423105BB6cCEB71473aD35c",
  //   start: "2025-06-25",
  // },
};

const info = {
  methodology: {
    Fees: "Total borrow interest paid by borrowers + liquidation bonues earned by liquidators.",
    SupplySideRevenue: "Total interests are distributed to suppliers/lenders + liquidation bonues to liquidators.",
    Revenue: "No revenue for Morpho protocol.",
    ProtocolRevenue: "No revenue for Morpho protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets.',
      [METRIC.LIQUIDATION_FEES]: 'All bonuses earned by liquidators from liquidations.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'No revenue from Morpho protocol.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'All interests paid are distributedd to vaults suppliers, lenders.',
      [METRIC.LIQUIDATION_FEES]: 'All bonuses earned by liquidators from liquidations.',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: 'No revenue from Morpho protocol.',
    },
  }
}

type MorphoMarket = {
  marketId: string;
  loanAsset: string;
  collateralAsset?: string;
  lltv: bigint;
  lif: bigint;
};

type MorphoBlueAccrueInterestEvent = {
  token: string | undefined | null;
  interest: bigint;
};

type MorphoBlueLiquidateEvent = {
  token: string | undefined | null; // collateral asset
  lif: bigint;
  seizedAmount: bigint;
};

const BLUE_API_ENDPOINT = "https://blue-api.morpho.org/graphql";

const query = `
  query GetMarketsData($chainId: Int!, $first: Int!, $skip: Int!) {
    markets(where: { chainId_in: [$chainId], whitelisted: true }, first: $first, skip: $skip) {
      items {
        uniqueKey
        lltv
        loanAsset {
          address
        }
        collateralAsset {
          address
        }
      }
    }
  }
`;

const MorphoBlueAbis = {
  AccrueInterest: "event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)",
  Liquidate: "event Liquidate(bytes32 indexed id,address indexed caller,address indexed borrower,uint256 repaidAssets,uint256 repaidShares,uint256 seizedAssets,uint256 badDebtAssets,uint256 badDebtShares)",
  CreateMarket: "event CreateMarket(bytes32 indexed id, tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams)",
};

// https://docs.morpho.org/learn/concepts/liquidation/#liquidation-incentive-factor-lif
function _getLIFFromLLTV(lltv: bigint): bigint {
  const B = BigInt(3e17) // 0.3
  const M = BigInt(115e16) // 1.15
  const LIF = BigInt(1e36) / ((B * lltv / BigInt(1e18)) + (BigInt(1e18) - B))
  return LIF > M ? M : LIF
}

const _fetchMarkets = async (chainId: number, url: string): Promise<Array<MorphoMarket>> => {
  let allMarkets: Array<MorphoMarket> = [];
  let skip = 0;
  const first = 300;
  let marketsBatch: Array<MorphoMarket> = [];
  do {
    const res = await request(url, query, { chainId, first, skip });
    marketsBatch = res.markets.items
    .map((item: any) => {
      return {
        marketId: item.uniqueKey,
        loanAsset: item.loanAsset.address,
        collateralAsset: item.collateralAsset ? item.collateralAsset.address : undefined,
        lltv: BigInt(item.lltv),
        lif: _getLIFFromLLTV(BigInt(item.lltv)),
      };
    });
    allMarkets = allMarkets.concat(marketsBatch);
    skip += first;
  } while (marketsBatch.length === first);

  return allMarkets;
};

const fetchMarketsFromLogs = async (options: FetchOptions): Promise<Array<MorphoMarket>> => {
  const markets: Array<MorphoMarket> = [];

  const events = await options.getLogs({
    target: MorphoBlues[options.chain].blue,
    eventAbi: MorphoBlueAbis.CreateMarket,
    fromBlock: MorphoBlues[options.chain].fromBlock,
    cacheInCloud: true,
  });

  for (const event of events) {
    markets.push({
      marketId: event.id,
      loanAsset: event.marketParams.loanToken,
      collateralAsset: event.marketParams.collateralToken,
      lltv: BigInt(event.marketParams.lltv),
      lif: _getLIFFromLLTV(BigInt(event.marketParams.lltv)),
    })
  }

  return markets;
}

async function fetchMarketsFromSubgraph(
  chainId: number,
  url: string
): Promise<Array<MorphoMarket>> {
  // return getConfig("morpho-blue/markets-" + chainId, "", {
  //   fetcher: async () => _fetchMarkets(chainId, url),
  // });
  return _fetchMarkets(chainId, url)
}

const fetchEvents = async (
  options: FetchOptions
): Promise<{interests: Array<MorphoBlueAccrueInterestEvent>, liquidations: Array<MorphoBlueLiquidateEvent>}> => {
  let markets: Array<MorphoMarket> = []
  if (MorphoBlues[options.chain].chainId) {
    markets = await fetchMarketsFromSubgraph(
      Number(MorphoBlues[options.chain].chainId),
      BLUE_API_ENDPOINT
    );
  } else if (MorphoBlues[options.chain].fromBlock) {
    markets = await fetchMarketsFromLogs(options);
  }

  const marketMap = {} as {[key: string]: MorphoMarket};
  markets.forEach((item) => {
    marketMap[item.marketId.toLowerCase()] = item;
  });

  const interests: Array<MorphoBlueAccrueInterestEvent> = (
    await options.getLogs({
      eventAbi: MorphoBlueAbis.AccrueInterest,
      target: MorphoBlues[options.chain].blue,
    })
  ).map((log: any) => {
    return {
      token: marketMap[String(log.id).toLowerCase()] ? marketMap[String(log.id).toLowerCase()].loanAsset : null,
      interest: BigInt(log.interest),
    };
  });
  const liquidations: Array<MorphoBlueLiquidateEvent> = (
    await options.getLogs({
      eventAbi: MorphoBlueAbis.Liquidate,
      target: MorphoBlues[options.chain].blue,
    })
  ).filter(log => marketMap[String(log.id).toLowerCase()]).map((log: any) => {
    return {
      token: marketMap[String(log.id).toLowerCase()] ? marketMap[String(log.id).toLowerCase()].collateralAsset : null,
      lif: marketMap[String(log.id).toLowerCase()].lif,
      seizedAmount: BigInt(log.seizedAssets),
    };
  });

  return { interests, liquidations }
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const { interests, liquidations } = await fetchEvents(options);

  // count borrow interests
  for (const event of interests) {
    if (event.token) {
      dailyFees.add(event.token, event.interest, METRIC.BORROW_INTEREST);
    }
  }

  // count liqdation bonuses
  for (const event of liquidations) {
    if (event.token) {
      const exactSeizedAmount = BigInt(event.seizedAmount) * BigInt(1e18) / event.lif
      dailyFees.add(event.token, BigInt(event.seizedAmount) - exactSeizedAmount, METRIC.LIQUIDATION_FEES);
    }
  }

  return {
    dailyFees: dailyFees,
    dailySupplySideRevenue: dailyFees,

    // Morpho gets no fees
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: info.methodology,
  breakdownMethodology: info.breakdownMethodology,
  fetch: fetch,
  adapter: {}
};

for (const [chain, blueConfig] of Object.entries(MorphoBlues)) {
  (adapter.adapter as any)[chain] = {
    fetch,
    start: blueConfig.start,
  }
}

export default adapter;
