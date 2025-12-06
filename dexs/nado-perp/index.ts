import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

interface IProducts {
  perp_products: number[];
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
    perp_products: allProducts.perp_products
      .map((product: { product_id: number }) => product.product_id)
      .filter((id: number) => validSymbols.includes(id))
  };
};

const computeVolume = async (
  timestamp: number,
  productIds: number[],
  fetchOptions: FetchOptions
) => {
  if (!productIds.length) {
    return { dailyVolume: undefined };
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
    return { dailyVolume: undefined };
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

  return { dailyVolume };
};


const fetch = async (timestamp: number, _: any, fetchOptions: FetchOptions) => {
  const products = await fetchProducts(fetchOptions);
  const perpVolumes = await computeVolume(timestamp, products.perp_products, fetchOptions);
  return { dailyVolume: perpVolumes.dailyVolume };
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.INK],
  start: '2025-11-15',
};

export default adapter;
