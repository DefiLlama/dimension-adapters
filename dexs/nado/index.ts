import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

interface IProducts {
  spot_products: number[];
  perp_products: number[];
  margined_products: number[];
}

// Nado (Private Alpha)
// Production API on Ink Mainnet
const gatewayInkUrl = "https://gateway.prod.nado.xyz/v1";
const archiveInkUrl = "https://archive.prod.nado.xyz/v1";

type TURL = {
  [s: string]: {
    gateway: string;
    archive: string;
  };
};

const url: TURL = {
  [CHAIN.INK]: {
    gateway: gatewayInkUrl,
    archive: archiveInkUrl,
  },
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
      totalVolume: totalVolume ? `${totalVolume}` : undefined,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: timestamp,
    };
  } else {
    return {
      totalVolume: undefined,
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

// Start time for Nado on Ink Mainnet - November 16, 2025
const inkStartTime = 1763251200;

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.INK]: {
        fetch: fetchSpots,
        start: inkStartTime,
      },
    },
    derivatives: {
      [CHAIN.INK]: {
        fetch: fetchPerps,
        start: inkStartTime,
      },
    },
  },
};

export default adapter;
