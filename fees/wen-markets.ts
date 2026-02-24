import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const wenLedger: any = {
  [CHAIN.POLYGON]: "0x5574d1e44eFcc5530409fbE1568f335DaF83951c"
}
const abis: any = {
  getStats: "function getStats() view returns ((uint256 totalVolume, uint256 totalLiquidityBootstrapped, uint256 totalTokensCreated, uint256 totalTokensGraduated, uint256 totalTrades))"
};

const fetchFees = async (options: FetchOptions) => {
  const tradeVolume = options.createBalances();
  const bootstrapped = options.createBalances();

  const fromStats = await options.fromApi.call({
    target: wenLedger[options.chain],
    abi: abis.getStats,
  });

  const toStats = await options.toApi.call({
    target: wenLedger[options.chain],
    abi: abis.getStats,
  });

  const dailyVolume = toStats.totalVolume - fromStats.totalVolume;
  const dailyBootstrapped = toStats.totalLiquidityBootstrapped - fromStats.totalLiquidityBootstrapped;

  tradeVolume.addGasToken(dailyVolume);
  bootstrapped.addGasToken(dailyBootstrapped / 0.93);
  bootstrapped.resizeBy(0.07); // 7% of liquidity bootstrapped

  const dailyFees = tradeVolume.clone();
  dailyFees.resizeBy(0.01); // 1% of trading volume
  dailyFees.addBalances(bootstrapped);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees
  };
};

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2024-05-28',
    },
  },
  methodology: {
    Fees: "Tokens trading and launching fees paid by users.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  }
};

export default adapters;
