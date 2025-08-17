import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SUPERLEND_USD = "0x10076ed296571cE4Fde5b1FDF0eB9014a880e47B";
const PRICE_ABI =
  "function convertToAssets(uint256 _shares) external view returns (uint256)";

const fetch = async (options: FetchOptions) => {
  const totalSupply =
    (await options.api.call({
      abi: "uint256:totalSupply",
      target: SUPERLEND_USD,
    })) / 1e6;

  const slUsdPriceYesterday =
    (await options.fromApi.call({
      abi: PRICE_ABI,
      target: SUPERLEND_USD,
      params: ["1000000000000000000"],
    })) / 1e18;

  const slUsdPriceToday =
    (await options.toApi.call({
      abi: PRICE_ABI,
      target: SUPERLEND_USD,
      params: ["1000000000000000000"],
    })) / 1e18;

  const dailyYield = (slUsdPriceToday - slUsdPriceYesterday) * totalSupply;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(dailyYield / 0.9);

  const dailyRevenue = options.createBalances();
  dailyRevenue.add(dailyFees.clone(0.1));

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: dailyFees.clone(0.9),
  };
};

const methodology = {
  Fees: "Total yield earned by the superfund through the allocation of funds across various protocols",
  Revenue: "10% of the yield charged as a protocol fee",
  ProtocolRevenue: "All revenue is allocated to the protocol",
  SupplySideRevenue: "Yield earned by holders of Superlend USD",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-01-23",
};

export default adapter;
