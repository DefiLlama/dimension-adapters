import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const ONE_USD = 100_000_000n;

// Fallback source: KiloEx official queryProducts responses; OI values are always read onchain.
const FALLBACK_PRODUCT_IDS = [
  1, 2, 3, 5, 6, 7, 9, 10, 13, 14, 16, 17, 19, 21, 22, 23, 26, 29, 31, 33,
  34, 41, 49, 55, 59, 67, 71, 81, 82, 89, 96, 103, 121, 136, 149, 154, 160,
  163, 211, 212, 213, 301, 302, 303, 304, 419, 421, 422, 426, 453,
];

const PRODUCT_SUMMARY_ABI =
  "function productSummary(uint256[] ids) view returns (int256[] fundingRates, uint256[] maxOpenForLong, uint256[] maxOpenForShort, bool[] isActives, uint256[] openInterestLongs, uint256[] openInterestShorts)";

const chainConfig: Record<string, { perpTradeReader: string; endpoint: string; start: string; deadFrom?: string }> = {
  // Source: KiloEx python SDK config_kiloex.ini view_address (PerpTradeReader).
  [CHAIN.BSC]: {
    perpTradeReader: "0x078E31821C94e5a99a64Fdc60cCae97E807ffCda",
    endpoint: "https://api.kiloex.io/common/queryProducts",
    start: "2024-12-10",
  },
  [CHAIN.OP_BNB]: {
    perpTradeReader: "0x2f179F55a780C44e319241031cD596eB6f1266bC",
    endpoint: "https://opapi.kiloex.io/common/queryProducts",
    start: "2024-12-10",
  },
  [CHAIN.BASE]: {
    perpTradeReader: "0xC8d733e9fb7c1ebBCfC259A83A49401bDb963292",
    endpoint: "https://baseapi.kiloex.io/common/queryProducts",
    start: "2024-12-10",
  },
  [CHAIN.MANTA]: {
    perpTradeReader: "0xE47262628F70981177AF961c75d1aA0d29aAd4d0",
    endpoint: "https://mantaapi.kiloex.io/common/queryProducts",
    start: "2024-12-10",
    deadFrom: "2026-05-12",
  },
  [CHAIN.BSQUARED]: {
    perpTradeReader: "0xcEa5BC91C2042eDdE918333416A5920A21E501F7",
    endpoint: "https://b2api.kiloex.io/common/queryProducts",
    start: "2024-12-10",
    deadFrom: "2026-02-24",
  },
};

const getProductIds = async (options: FetchOptions) => {
  const products = await fetchURL(chainConfig[options.chain].endpoint).then((res) => res?.productList).catch(() => null);
  const ids = products?.map((product: any) => Number(product.productId)).filter((id: number) => Number.isFinite(id));
  return ids?.length ? [...new Set(ids)] : FALLBACK_PRODUCT_IDS;
};

const fetch = async (options: FetchOptions) => {
  const productIds = await getProductIds(options);
  const [, , , , longOis, shortOis] = await options.api.call({
    target: chainConfig[options.chain].perpTradeReader,
    abi: PRODUCT_SUMMARY_ABI,
    params: [productIds] as any,
  });

  const formatOI = (value: bigint) => `${value / ONE_USD}.${(value % ONE_USD).toString().padStart(8, "0")}`.replace(/\.?0+$/, "");
  const longOpenInterestSum = longOis.reduce((sum: bigint, oi: bigint) => sum + BigInt(oi), 0n);
  const shortOpenInterestSum = shortOis.reduce((sum: bigint, oi: bigint) => sum + BigInt(oi), 0n);

  return {
    openInterestAtEnd: formatOI(longOpenInterestSum + shortOpenInterestSum),
    longOpenInterestAtEnd: formatOI(longOpenInterestSum),
    shortOpenInterestAtEnd: formatOI(shortOpenInterestSum),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
};

export default adapter;
