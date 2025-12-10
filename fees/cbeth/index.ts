import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CBETH = {
  [CHAIN.ETHEREUM]: "0xbe9895146f7af43049ca1c1ae358b0541ea49704",
  //[CHAIN.BASE]: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
  //[CHAIN.POLYGON]: "0x4b4327db1600b8b1440163f667e199cef35385f5",
  //[CHAIN.ARBITRUM]: "0x1debd73e752beaf79865fd6446b0c970eae7732f",
  //[CHAIN.OPTIMISM]: "0xaddb6a0412de1ba0f936dcaeb8aaa24578dcf3b2",
};

// fees data from source: https://research.llamarisk.com/research/risk-collateral-risk-assessment-coinbase-wrapped-staked-eth-cbeth
const PROTOCOL_FEE = 0.25; // 25%

const ABIS = {
  exchangeRate: "uint256:exchangeRate",
  totalSupply: "uint256:totalSupply",
};

const methodology = {
  Fees: "Gross staking rewards inferred from cbETH exchange rate appreciation.",
  SupplySideRevenue: "75% of staking rewards accrue to cbETH holders via exchange rate.",
  ProtocolRevenue: "25% staking commission kept by Coinbase.",
  Revenue: "Equal to protocol commission (25% of gross rewards).",
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const token = CBETH[options.chain];
  const [rateBefore, supplyBefore] = await Promise.all([
    options.fromApi.call({ target: token, abi: ABIS.exchangeRate }),
    options.fromApi.call({ target: token, abi: ABIS.totalSupply }),
  ]);

  const [rateAfter, supplyAfter] = await Promise.all([
    options.toApi.call({ target: token, abi: ABIS.exchangeRate }),
    options.toApi.call({ target: token, abi: ABIS.totalSupply }),
  ]);

  const assetsBefore = supplyBefore * rateBefore / 1e18;
  const assetsAfter = supplyAfter * rateAfter / 1e18;

  const netRewards =  assetsAfter - assetsBefore
  const grossRewards = netRewards / (1 - PROTOCOL_FEE);

  dailyFees.addGasToken(grossRewards);
  dailyProtocolRevenue.addGasToken(grossRewards * PROTOCOL_FEE);
  dailySupplySideRevenue.addGasToken(grossRewards * (1 - PROTOCOL_FEE));

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2022-08-01",
    },
  },
};

export default adapter;

