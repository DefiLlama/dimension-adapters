import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { httpGet, httpPost } from "../utils/fetchURL";

interface IProducts {
  spot_products: number[];
}

interface MarketSnapshots {
  interval: {
    count: number;
    granularity: number;
    max_time: number;
  };
  product_ids: number[];
}

interface QueryBody {
  market_snapshots: MarketSnapshots;
}

interface IData {
  [s: string]: string;
}

interface Snapshot {
  [s: string]: IData;
}

interface Response {
  snapshots: Snapshot[];
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
  };
};

const query = async (
  max_time: number,
  productIds: number[],
  fetchOptions: FetchOptions
): Promise<Response> => {
  const body: QueryBody = {
    market_snapshots: {
      interval: {
        count: 2,
        granularity: 86400,
        max_time: max_time,
      },
      product_ids: productIds,
    },
  };

  const response = await httpPost(url[fetchOptions.chain].archive, body);
  return response;
};

const sumAllProductStats = (stat_map: IData): number => {
  let stat_sum = 0;
  for (const v of Object.values(stat_map)) {
    stat_sum += parseInt(v);
  }
  return stat_sum / 1e18;
};

const get24hrStat = async (
  field: string,
  max_time: number,
  productIds: number[],
  fetchOptions: FetchOptions
): Promise<number> => {
  const response = await query(max_time, productIds, fetchOptions);
  const cur_res: Snapshot = response.snapshots[0];
  const past_res: Snapshot = response.snapshots[1];
  return (
    sumAllProductStats(cur_res[field]) - sumAllProductStats(past_res[field])
  );
};

const get24hrFees = async (
  max_time: number,
  productIds: number[],
  fetchOptions: FetchOptions
): Promise<number> => {
  const fees = await get24hrStat(
    "cumulative_taker_fees",
    max_time,
    productIds,
    fetchOptions
  );
  const sequencer_fees = await get24hrStat(
    "cumulative_sequencer_fees",
    max_time,
    productIds,
    fetchOptions
  );
  return fees - sequencer_fees;
};

const get24hrRevenue = async (
  max_time: number,
  productIds: number[],
  fetchOptions: FetchOptions
): Promise<number> => {
  const fees = await get24hrFees(max_time, productIds, fetchOptions);
  const rebates = await get24hrStat(
    "cumulative_maker_fees",
    max_time,
    productIds,
    fetchOptions
  );
  return fees + rebates;
};

const fetch = async (
  timestamp: number,
  _: any,
  fetchOptions: FetchOptions
): Promise<FetchResultFees> => {
  const products = await fetchProducts(fetchOptions);

  if (!products.spot_products.length) {
    return { dailyFees: undefined, dailyRevenue: undefined };
  }

  const dailyFees = await get24hrFees(timestamp, products.spot_products, fetchOptions);
  const dailyRevenue = await get24hrRevenue(timestamp, products.spot_products, fetchOptions);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Fees: 'spot trading fees paid by users',
  Revenue: 'trading fees - maker rebates goes to the protocol treasury',
  ProtocolRevenue: 'net trading fees goes to the protocol treasury',
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.INK],
  start: '2025-11-15',
  methodology,
};

export default adapter;
