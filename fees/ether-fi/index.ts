// https://etherfi.gitbook.io/etherfi/liquid/technical-documentation#fees
import * as sdk from "@defillama/sdk";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LIQUID_VAULT = "0xeA1A6307D9b18F8d1cbf1c3Dd6aad8416C06a221";
const YEAR = 365;
const ANNUAL_FEE_RATE = 0.02;

const getDailyFees = async (api: sdk.ChainApi): Promise<number> => {
  const dailyFeeRate = ANNUAL_FEE_RATE / YEAR;
  const [asset, totalSupply] = await Promise.all([
    await api.call({
      target: LIQUID_VAULT,
      abi: "function asset() external view returns (address)",
    }),
    await api.call({
      target: LIQUID_VAULT,
      abi: "erc20:totalSupply",
    }),
  ]);

  api.addTokens(asset, totalSupply);
  return (await api.getUSDValue()) * dailyFeeRate;
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async () => {
        const api = new sdk.ChainApi({ chain: CHAIN.ETHEREUM });
        const dailyFees = await getDailyFees(api);
        return {
          dailyFees: Number(dailyFees.toFixed(0)),
        };
      },
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
