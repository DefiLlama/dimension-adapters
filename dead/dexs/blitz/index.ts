import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

interface IProducts {
  spot_products: number[];
  perp_products: number[];
  margined_products: number[];
}

const gatewayBaseUrl = "https://gateway.blast-prod.vertexprotocol.com/v1";
const archiveBaseUrl = "https://archive.blast-prod.vertexprotocol.com/v1";

const fetchValidSymbols = async (): Promise<number[]> => {
  const symbols = await httpGet(`${gatewayBaseUrl}/symbols`);
  return symbols.map((product: { product_id: number }) => product.product_id);
};

const fetchProducts = async (): Promise<IProducts> => {
  const validSymbols = await fetchValidSymbols();
  const allProducts = (
    await httpGet(`${gatewayBaseUrl}/query?type=all_products`)
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

const computeVolume = async (timestamp: number, productIds: number[]) => {
  const snapshots = (
    await httpPost(archiveBaseUrl, {
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
      (acc, current) => acc + Number(current),
      Number(0)
    ) / Number(10 ** 18)
  );
  const totalVolumeOneDayAgo = Number(
    Object.values(prevCumulativeVolumes).reduce(
      (acc, current) => acc + Number(current),
      Number(0)
    ) / Number(10 ** 18)
  );
  const dailyVolume = totalVolume - totalVolumeOneDayAgo;
  return {
    dailyVolume: dailyVolume,
  };
};

const fetchSpots = async (timeStamp: number) => {
  const spotProductIds = (await fetchProducts()).spot_products;
  return await computeVolume(timeStamp, spotProductIds);
};

const fetchPerps = async (timeStamp: number) => {
  const perpProductIds = (await fetchProducts()).perp_products;
  const marginedProductIds = (await fetchProducts()).margined_products;
  return await computeVolume(
    timeStamp,
    perpProductIds.concat(marginedProductIds)
  );
};

const startTime = 1710259200;

const adapter: BreakdownAdapter = {
  deadFrom: '2025-07-18', // https://docs.vertexprotocol.com
  breakdown: {
    swap: {
      [CHAIN.BLAST]: {
        fetch: fetchSpots,
        start: startTime,
      },
    },
    derivatives: {
      [CHAIN.BLAST]: {
        fetch: fetchPerps,
        start: startTime,
      },
    },
  },
};

export default adapter;
