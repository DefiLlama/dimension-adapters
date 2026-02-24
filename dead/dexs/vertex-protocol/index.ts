import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

interface IProducts {
  spot_products: number[];
  perp_products: number[];
  margined_products: number[];
}

const gatewayArbitrumUrl = "https://gateway.prod.vertexprotocol.com/v1";
const archiveArbitrumUrl = "https://archive.prod.vertexprotocol.com/v1";

const gatewayMantleUrl = "https://gateway.mantle-prod.vertexprotocol.com/v1";
const archiveMantleUrl = "https://archive.mantle-prod.vertexprotocol.com/v1";

const gatewaySeiUrl = "https://gateway.sei-prod.vertexprotocol.com/v1";
const archiveSeiUrl = "https://archive.sei-prod.vertexprotocol.com/v1";

const gatewayBaseUrl = "https://gateway.base-prod.vertexprotocol.com/v1";
const archiveBaseUrl = "https://archive.base-prod.vertexprotocol.com/v1";

const gatewaySonicUrl = "https://gateway.sonic-prod.vertexprotocol.com/v1";
const archiveSonicUrl = "https://archive.sonic-prod.vertexprotocol.com/v1";

const gatewayAbstractUrl = "https://gateway.abstract-prod.vertexprotocol.com/v1";
const archiveAbstractUrl = "https://archive.abstract-prod.vertexprotocol.com/v1";

const gatewayAvaxUrl = "https://gateway.avax-prod.vertexprotocol.com/v1";
const archiveAvaxUrl = "https://archive.avax-prod.vertexprotocol.com/v1";

type TURL = {
  [s: string]: {
    gateway: string;
    archive: string;
  };
};
const url: TURL = {
  [CHAIN.ARBITRUM]: {
    gateway: gatewayArbitrumUrl,
    archive: archiveArbitrumUrl,
  },
  [CHAIN.MANTLE]: {
    gateway: gatewayMantleUrl,
    archive: archiveMantleUrl,
  },
  [CHAIN.BASE]: {
    gateway: gatewayBaseUrl,
    archive: archiveBaseUrl,
  },
  [CHAIN.SEI]: {
    gateway: gatewaySeiUrl,
    archive: archiveSeiUrl,
  },
  [CHAIN.SONIC]: {
    gateway: gatewaySonicUrl,
    archive: archiveSonicUrl
  },
  [CHAIN.ABSTRACT]: {
    gateway: gatewayAbstractUrl,
    archive: archiveAbstractUrl
  },
  [CHAIN.AVAX]: {
    gateway: gatewayAvaxUrl,
    archive: archiveAvaxUrl
  }
};

const fetchValidSymbols = async (
  fetchOptions: FetchOptions
): Promise<number[]> => {
  const symbols = await httpGet(`${url[fetchOptions.chain].gateway}/symbols`);
  return symbols.map((product: { product_id: number }) => product.product_id);
};

const fetchProducts = async (
  fetchOptions: FetchOptions
): Promise<IProducts> => {
  const validSymbols = await fetchValidSymbols(fetchOptions);
  const allProducts = (
    await httpGet(`${url[fetchOptions.chain].gateway}/query?type=all_products`)
  ).data;
  return {
    spot_products: allProducts.spot_products
      .map((product: { product_id: number }) => product.product_id)
      .filter((id: number) => validSymbols.includes(id) && id > 0),
    perp_products: allProducts.perp_products
      .map((product: { product_id: number }) => product.product_id)
      .filter((id: number) => validSymbols.includes(id)),
    margined_products: allProducts.spot_products
      .map((product: { product_id: number }) => product.product_id)
      .filter((id: number) => validSymbols.includes(id) && id > 0),
  };
};

const computeVolume = async (
  timestamp: number,
  productIds: number[],
  fetchOptions: FetchOptions
) => {
  if (productIds.length > 0) {
    const snapshots = (
      await httpPost(url[fetchOptions.chain].archive, {
        market_snapshots: {
          interval: {
            count: 2,
            granularity: 86400,
            max_time: timestamp,
          },
          product_ids: productIds,
        },
      })
    ).snapshots;
    const lastCumulativeVolumes: Record<string, string> =
      snapshots[0].cumulative_volumes;
    const prevCumulativeVolumes: Record<string, string> =
      snapshots[1].cumulative_volumes;
    const totalVolume = Number(
      Object.values(lastCumulativeVolumes).reduce(
        (acc, current) => acc + BigInt(current),
        BigInt(0)
      ) / BigInt(10 ** 18)
    );
    const totalVolumeOneDayAgo = Number(
      Object.values(prevCumulativeVolumes).reduce(
        (acc, current) => acc + BigInt(current),
        BigInt(0)
      ) / BigInt(10 ** 18)
    );
    const dailyVolume = totalVolume - totalVolumeOneDayAgo;
    return {
      dailyVolume: dailyVolume,
      timestamp: timestamp,
    };
  } else {
    return {
      dailyVolume: undefined,
      timestamp: timestamp,
    };
  }
  
};

const fetchSpots = async (
  timeStamp: number,
  _: any,
  fetchOptions: FetchOptions
) => {
  const spotProductIds = (await fetchProducts(fetchOptions)).spot_products;
  return computeVolume(timeStamp, spotProductIds, fetchOptions);
};

const fetchPerps = async (
  timeStamp: number,
  _: any,
  fetchOptions: FetchOptions
) => {
  const perpProductIds = (await fetchProducts(fetchOptions)).perp_products;
  const marginedProductIds = (await fetchProducts(fetchOptions))
    .margined_products;
  return await computeVolume(
    timeStamp,
    perpProductIds.concat(marginedProductIds),
    fetchOptions
  );
};

const startTime = 1682514000;
const seiStartTime = 1723547681;
const baseStartTime = 1725476671;
const sonicStartTime = 1734543997;
const abstractStartTime = 1738158858;
const avaxStartTime = 1742994000;

const adapter: BreakdownAdapter = {
  deadFrom: '2025-07-18', // https://docs.vertexprotocol.com
  breakdown: {
    swap: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchSpots,
        start: startTime,
      },
      [CHAIN.MANTLE]: {
        fetch: fetchSpots,
        start: startTime,
      },
      [CHAIN.SEI]: {
        fetch: fetchSpots,
        start: seiStartTime,
      },
      [CHAIN.BASE]: {
        fetch: fetchSpots,
        start: baseStartTime,
      },
      [CHAIN.SONIC]: {
        fetch: fetchSpots,
        start: sonicStartTime,
      },
      [CHAIN.ABSTRACT]: {
        fetch: fetchSpots,
        start: abstractStartTime,
      },
      [CHAIN.AVAX]: {
        fetch: fetchSpots,
        start: avaxStartTime,
      },
    },
    derivatives: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchPerps,
        start: "2024-06-20",
      },
      [CHAIN.MANTLE]: {
        fetch: fetchPerps,
        start: "2024-06-20",
      },
      [CHAIN.SEI]: {
        fetch: fetchPerps,
        start: seiStartTime,
      },
      [CHAIN.BASE]: {
        fetch: fetchPerps,
        start: baseStartTime,
      },
      [CHAIN.SONIC]: {
        fetch: fetchPerps,
        start: sonicStartTime,
      },
      [CHAIN.ABSTRACT]: {
        fetch: fetchPerps,
        start: abstractStartTime,
      },
      [CHAIN.AVAX]: {
        fetch: fetchPerps,
        start: avaxStartTime,
      },
    },
  },
};

export default adapter;
