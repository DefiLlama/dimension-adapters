import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const wenLedger: any = {
  [CHAIN.POLYGON]: "0x5574d1e44eFcc5530409fbE1568f335DaF83951c"
}
const abis: any = {
  getStats: {
    "inputs": [],
    "name": "getStats",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "totalVolume",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalLiquidityBootstrapped",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalTokensCreated",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalTokensGraduated",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalTrades",
            "type": "uint256"
          }
        ],
        "internalType": "struct WenLedger.Stats",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
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
      start: 1716854400
    },
  }
};

export default adapters;
