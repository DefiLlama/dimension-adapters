import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

interface IProducts {
  spot_products: number[];
  perp_products: number[];
  margined_products: number[];
}

const gatewayBaseUrl = "https://gateway.prod.vertexprotocol.com/v1";
const archiveBaseUrl = "https://archive.prod.vertexprotocol.com/v1";

const gatewayMatleBaseUrl = "https://gateway.mantle-prod.vertexprotocol.com/v1";
const archiveMatleBaseUrl = "https://archive.mantle-prod.vertexprotocol.com/v1";

const gatewaySeiBaseUrl = "https://gateway.sei-prod.vertexprotocol.com/v1";
const archiveSeiBaseUrl = "https://archive.sei-prod.vertexprotocol.com/v1";

type TURL = {
  [s: string]: {
    gateway: string;
    archive: string;
  }
}
const url: TURL = {
  [CHAIN.ARBITRUM]: {
    gateway: gatewayBaseUrl,
    archive: archiveBaseUrl,
  },
  [CHAIN.MANTLE]: {
    gateway: gatewayMatleBaseUrl,
    archive: archiveMatleBaseUrl,
  },
  [CHAIN.SEI]: {
    gateway: gatewaySeiBaseUrl,
    archive: archiveSeiBaseUrl,
  },
}

const fetchValidSymbols = async (fetchOptions: FetchOptions): Promise<number[]> => {
  const symbols = (await httpGet(`${url[fetchOptions.chain].gateway}/symbols`));
  return symbols.map((product: { product_id: number }) => product.product_id);
};

const fetchProducts = async (fetchOptions: FetchOptions): Promise<IProducts> => {
  const validSymbols = await fetchValidSymbols(fetchOptions);
  const allProducts = (await httpGet(`${url[fetchOptions.chain].gateway}/query?type=all_products`)).data;
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

const computeVolume = async (timestamp: number, productIds: number[], fetchOptions: FetchOptions) => {
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
    totalVolume: totalVolume ? `${totalVolume}` : undefined,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: timestamp,
  };
};

const fetchSpots = async (timeStamp: number, _: any, fetchOptions: FetchOptions) => {
  const spotProductIds = (await fetchProducts(fetchOptions)).spot_products;
  return await computeVolume(timeStamp, spotProductIds, fetchOptions);
};

const fetchPerps = async (timeStamp: number, _: any, fetchOptions: FetchOptions) => {
  const perpProductIds = (await fetchProducts(fetchOptions)).perp_products;
  const marginedProductIds = (await fetchProducts(fetchOptions)).margined_products;
  return await computeVolume(
    timeStamp,
    perpProductIds.concat(marginedProductIds),
    fetchOptions
  );
};

const startTime = 1682514000;
const seiStartTime = 1723547681

const adapter: BreakdownAdapter = {
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
      }
    },
    derivatives: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchPerps,
        start: 1718841600,
      },
      [CHAIN.MANTLE]: {
        fetch: fetchPerps,
        start: 1718841600,
      },
      [CHAIN.SEI]: {
        fetch: fetchPerps,
        start: seiStartTime,
      }
    },
  },
};

export default adapter;
