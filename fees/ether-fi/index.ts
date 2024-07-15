// https://etherfi.gitbook.io/etherfi/liquid/technical-documentation#fees
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LIQUID_VAULT = "0xeA1A6307D9b18F8d1cbf1c3Dd6aad8416C06a221";
const YEAR = 365;
const ANNUAL_FEE_RATE = 0.02;

const fetch = async (options: FetchOptions) => {
  const dailyFeeRate = ANNUAL_FEE_RATE / YEAR;
  const dailyFees = options.createBalances();
  const [asset, totalSupply] = await Promise.all([
    options.api.call({
      target: LIQUID_VAULT,
      abi: "function asset() external view returns (address)",
    }),
    options.api.call({
      target: LIQUID_VAULT,
      abi: "function totalAssets() external view returns (uint256 assets)",
    }),
  ]);
  dailyFees.add(asset, totalSupply);
  dailyFees.resizeBy(dailyFeeRate);
  return { dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      meta: {
        methodology: {
          totalFees:
            "Ether.fi-Liquid vault charges an annualized 2% platform fee based on vault TVL",
        },
      },
      start: 1710284400,
    },
  },
};

export default adapter;
