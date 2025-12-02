import { FetchOptions, SimpleAdapter } from "../../adapters/types";
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
  if (!productIds.length) {
    return {
      totalVolume: undefined,
      dailyVolume: undefined,
    };
  }

  const response = await httpPost(url[fetchOptions.chain].archive, {
    market_snapshots: {
      interval: {
        count: 2,
        granularity: 86400,
        max_time: timestamp,
      },
      product_ids: productIds,
    },
  });

  const snapshots = response?.snapshots;
  if (!Array.isArray(snapshots) || snapshots.length < 2) {
    return {
      totalVolume: undefined,
      dailyVolume: undefined,
    };
  }

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
    totalVolume,
    dailyVolume,
  };
};

// Start time for Nado on Ink Mainnet - November 16, 2025
const inkStartTime = 1763251200;

const fetch = async (
  timestamp: number,
  _: any,
  fetchOptions: FetchOptions
) => {
  const products = await fetchProducts(fetchOptions);
  const perpAndMarginedProducts = products.perp_products.concat(
    products.margined_products
  );

  const [spotVolumes, derivativeVolumes] = await Promise.all([
    computeVolume(timestamp, products.spot_products, fetchOptions),
    computeVolume(timestamp, perpAndMarginedProducts, fetchOptions),
  ]);

  const dailyVolume =
    (spotVolumes.dailyVolume ?? 0) + (derivativeVolumes.dailyVolume ?? 0);
  const totalVolume =
    (spotVolumes.totalVolume ?? 0) + (derivativeVolumes.totalVolume ?? 0);

  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    totalVolume: totalVolume ? `${totalVolume}` : undefined,
    timestamp,
  };
};

const methodology = {
  Volume:
    "Sums spot, perp, and margined product volume from Nado's Archive market_snapshots on Ink Mainnet.",
};

const breakdownMethodology = {
  Volume: {
    swap: "Spot product trading volume (product_ids > 0) filtered to valid symbols.",
    derivatives:
      "Perpetual and margined product trading volume filtered to valid symbols.",
  },
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.INK]: {
      fetch,
      start: inkStartTime,
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
