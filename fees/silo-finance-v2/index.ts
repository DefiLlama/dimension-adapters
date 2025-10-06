import * as sdk from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import { request } from "graphql-request";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { parseUnits } from "ethers";

type BadDebtSilo = {
  silo: string;
  timestamp: number;
};

type BadDebtSiloMapping = {
  [s: Chain]: BadDebtSilo[];
};

type SubgraphMapping = {
  [s: Chain]: string;
};

type SubgraphFeeQueryResponse = {
  feeTimeseries_collection: {
    id: string;
    timestamp: string;
    tokenAmount: string;
    tokenAddress: string;
    origin: string;
    market: {
      id: string;
    };
  }[];
};

type SubgraphTokenQueryResponse = {
  tokens: {
    id: string;
    symbol: string;
    decimals: string;
  }[];
};

const subgraphMapping: SubgraphMapping = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('2z5Mn4WW7K4yR1iH9KdignREkTq9EM1S4GX3yLaztRFg'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('DK5qWsSJSqkeW2GHDQQCB7xHnHwVN3K1LPpP6CYNXMh8'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('6NLL9WmjPYima4NhUpNEWeDu5eBXFuhP9QheRXkoJXR5'),
  [CHAIN.SONIC]: sdk.graph.modifyEndpoint('8wcbzcdNirQvk1ETh25wpVzb5GWs8DvugpbwrYnTCcxj'),
};

// Some silos started to represent bad debt because of a token price drop,
// so we will filter out these silos from the data
const badDebtSiloMapping: BadDebtSiloMapping = {
  [CHAIN.ETHEREUM]: [],
  [CHAIN.ARBITRUM]: [],
  [CHAIN.AVAX]: [],
  [CHAIN.SONIC]: [
    {
      silo: "0xccddbbbd1e36a6eda3a84cdcee2040a86225ba71",
      timestamp: 1754265600, // 2025-08-04
    },
    {
      silo: "0xed9777944a2fb32504a410d23f246463b3f40908",
      timestamp: 1754265600, // 2025-08-04
    },
    {
      silo: "0x0ab02dd08c1555d1a20c76a6ea30e3e36f3e06d4",
      timestamp: 1754265600, // 2025-08-04
    },
    {
      silo: "0x6e8c150224d6e9b646889b96eff6f7fd742e2c22",
      timestamp: 1754265600, // 2025-08-04
    },
    {
      silo: "0x1c1791911483e98875d162355fec47f37613f0fb",
      timestamp: 1754265600, // 2025-08-04
    },
    {
      silo: "0x8c98b43bf61f2b07c4d26f85732217948fca2a90",
      timestamp: 1754265600, // 2025-08-04
    },
  ],
};

const getFeeSumWithFilter = (
  feeData: SubgraphFeeQueryResponse["feeTimeseries_collection"],
  asset: string,
  origins?: string[]
) => {
  const filteredByAsset = feeData.filter((item) => item.tokenAddress === asset);
  if (!origins) {
    return filteredByAsset.reduce(
      (acc, item) => acc + Number(item.tokenAmount),
      0
    );
  }

  return filteredByAsset
    .filter((item) => origins?.includes(item.origin))
    .reduce((acc, item) => acc + Number(item.tokenAmount), 0);
};

async function fetch(
  options: FetchOptions,
  subgraphURL: string,
  badDebtSilos: BadDebtSilo[]
): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const feeQuery = `{
      feeTimeseries_collection(where: {timestamp_gte: ${options.startTimestamp}, timestamp_lt: ${options.endTimestamp}}, first: 1000) {
        id
        timestamp
        tokenAmount
        tokenAddress
        origin
        market {
          id
        }
      }
    }`;

  const tokenQuery = `{
    tokens(where: {type: "Asset"}, first: 1000) {
      id
      symbol
      decimals
    }
  }`;

  const [{ feeTimeseries_collection }, { tokens }] = await Promise.all([
    request<SubgraphFeeQueryResponse>(subgraphURL, feeQuery),
    request<SubgraphTokenQueryResponse>(subgraphURL, tokenQuery),
  ]);

  const dataWithoutBadDebtSilos = feeTimeseries_collection.filter(
    (item) =>
      !badDebtSilos.some(
        (silo) =>
          silo.silo.toLowerCase() === item.market.id.toLowerCase() &&
          Number(item.timestamp) >= silo.timestamp
      )
  );

  const uniqueAssets = [
    ...new Set(dataWithoutBadDebtSilos.map((item) => item.tokenAddress)),
  ];

  uniqueAssets.forEach((asset) => {
    const dailyFee = getFeeSumWithFilter(dataWithoutBadDebtSilos, asset);

    const dailyRevenueAsset = getFeeSumWithFilter(
      dataWithoutBadDebtSilos,
      asset,
      ["protocol", "deployer", "flashloan", "liquidation"]
    );

    const deployerRevenueAsset = getFeeSumWithFilter(
      dataWithoutBadDebtSilos,
      asset,
      ["deployer"]
    );

    const protocolRevenueAsset = getFeeSumWithFilter(
      dataWithoutBadDebtSilos,
      asset,
      ["protocol"]
    );

    const protocolRevenueRatioDenominator =
      protocolRevenueAsset + deployerRevenueAsset;

    const protocolRevenueRatio =
      protocolRevenueRatioDenominator > 0
        ? protocolRevenueAsset / protocolRevenueRatioDenominator
        : 0.5;

    const liquidationRevenueAsset = getFeeSumWithFilter(
      dataWithoutBadDebtSilos,
      asset,
      ["liquidation"]
    );

    const flashloanRevenueAsset = getFeeSumWithFilter(
      dataWithoutBadDebtSilos,
      asset,
      ["flashloan"]
    );

    const dailyProtocolRevenueFromLiquidationAsset =
      liquidationRevenueAsset * protocolRevenueRatio;
    const dailyProtocolRevenueFromFlashloanAsset =
      flashloanRevenueAsset * protocolRevenueRatio;

    const dailyProtocolRevenueAsset =
      getFeeSumWithFilter(dataWithoutBadDebtSilos, asset, ["protocol"]) +
      dailyProtocolRevenueFromLiquidationAsset +
      dailyProtocolRevenueFromFlashloanAsset;

    const dailySupplySideRevenueAsset = getFeeSumWithFilter(
      dataWithoutBadDebtSilos,
      asset,
      ["collateral"]
    );

    const tokenDecimals = Number(
      tokens.find((token) => token.id === asset)?.decimals
    );

    if (!tokenDecimals) {
      throw new Error(`Token ${asset} not found in tokens`);
    }

    dailyFees.add(
      asset,
      parseUnits(dailyFee.toFixed(tokenDecimals), tokenDecimals)
    );
    dailyRevenue.add(
      asset,
      parseUnits(dailyRevenueAsset.toFixed(tokenDecimals), tokenDecimals)
    );
    dailyProtocolRevenue.add(
      asset,
      parseUnits(
        dailyProtocolRevenueAsset.toFixed(tokenDecimals),
        tokenDecimals
      )
    );
    dailySupplySideRevenue.add(
      asset,
      parseUnits(
        dailySupplySideRevenueAsset.toFixed(tokenDecimals),
        tokenDecimals
      )
    );
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (options: FetchOptions) =>
        fetch(
          options,
          subgraphMapping[CHAIN.ETHEREUM],
          badDebtSiloMapping[CHAIN.ETHEREUM]
        ),
      start: "2025-06-02",
    },
    [CHAIN.ARBITRUM]: {
      fetch: (options: FetchOptions) =>
        fetch(
          options,
          subgraphMapping[CHAIN.ARBITRUM],
          badDebtSiloMapping[CHAIN.ARBITRUM]
        ),
      start: "2025-05-08",
    },
    [CHAIN.AVAX]: {
      fetch: (options: FetchOptions) =>
        fetch(
          options,
          subgraphMapping[CHAIN.AVAX],
          badDebtSiloMapping[CHAIN.AVAX]
        ),
      start: "2025-06-18",
    },
    [CHAIN.SONIC]: {
      fetch: (options: FetchOptions) =>
        fetch(
          options,
          subgraphMapping[CHAIN.SONIC],
          badDebtSiloMapping[CHAIN.SONIC]
        ),
      start: "2025-01-06",
    },
  },
  version: 2,
};

export default adapter;
