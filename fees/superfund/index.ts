import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://docs.superlend.xyz/superlend-vaults/superfunds
const PROTOCOL_FEE = 0.1; // 10%

const SUPERLEND_USD = "0x10076ed296571cE4Fde5b1FDF0eB9014a880e47B";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PRICE_ABI = "function convertToAssets(uint256 _shares) external view returns (uint256)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const totalAssets = await options.api.call({ abi: "uint256:totalAssets", target: SUPERLEND_USD })
  const slUsdPriceYesterday = await options.fromApi.call({ abi: PRICE_ABI, target: SUPERLEND_USD, params: ["1000000000000000000"] })
  const slUsdPriceToday = await options.toApi.call({ abi: PRICE_ABI, target: SUPERLEND_USD, params: ["1000000000000000000"] })

  const totalYieldIncludeProtocolFees = (slUsdPriceToday - slUsdPriceYesterday) * totalAssets / (1 - PROTOCOL_FEE) / 1e18;
  const protocolFees = totalYieldIncludeProtocolFees * PROTOCOL_FEE;

  dailyFees.add(USDC, totalYieldIncludeProtocolFees)
  dailyRevenue.add(USDC, protocolFees)

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
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
