import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

type ProductConfig = {
  symbol: string;
  token: string;
  oracle: string;
  oracleAbi: string;
  oracleDecimals: number;
  performanceFeeRate: number;
  start: string;
};

const abi = {
  totalSupply: "uint256:totalSupply",
  decimals: "uint8:decimals",
  lastAnswer: "function lastAnswer() view returns (int256)",
  latestAnswer: "function latestAnswer() view returns (int256)",
};

// Official Midas registry:
// https://docs.midas.app/resources/smart-contracts-registry
const products: Record<string, ProductConfig[]> = {
  [CHAIN.ETHEREUM]: [
    {
      symbol: "mTBILL",
      token: "0xdd629e5241cbc5919847783e6c96b2de4754e438",
      oracle: "0x056339C044055819E8Db84E71f5f2E1F536b2E5b",
      oracleAbi: abi.lastAnswer,
      oracleDecimals: 8,
      performanceFeeRate: 0,
      start: "2024-03-15",
    },
    {
      symbol: "mBASIS",
      token: "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656",
      oracle: "0xE4f2AE539442e1D3Fb40F03ceEbF4A372a390d24",
      oracleAbi: abi.lastAnswer,
      oracleDecimals: 8,
      performanceFeeRate: 0.2,
      start: "2024-08-19",
    },
  ],
  [CHAIN.BASE]: [
    {
      symbol: "mTBILL",
      token: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
      oracle: "0x70E58b7A1c884fFFE7dbce5249337603a28b8422",
      oracleAbi: abi.latestAnswer,
      oracleDecimals: 18,
      performanceFeeRate: 0,
      start: "2024-03-15",
    },
    {
      symbol: "mBASIS",
      token: "0x1C2757c1FeF1038428b5bEF062495ce94BBe92b2",
      oracle: "0x6d62D3C3C8f9912890788b50299bF4D2C64823b6",
      oracleAbi: abi.lastAnswer,
      oracleDecimals: 8,
      performanceFeeRate: 0.2,
      start: "2024-08-19",
    },
  ],
  [CHAIN.PLUME]: [
    {
      symbol: "mTBILL",
      token: "0xE85f2B707Ec5Ae8e07238F99562264f304E30109",
      oracle: "0xb701ABEA3E4b6EAdAc4F56696904c5F551d2617b",
      oracleAbi: abi.lastAnswer,
      oracleDecimals: 8,
      performanceFeeRate: 0,
      start: "2025-01-21",
    },
    {
      symbol: "mBASIS",
      token: "0x0c78Ca789e826fE339dE61934896F5D170b66d78",
      oracle: "0x01D169AAB1aB4239D5cE491860a65Ba832F72ef2",
      oracleAbi: abi.lastAnswer,
      oracleDecimals: 8,
      performanceFeeRate: 0.2,
      start: "2025-01-21",
    },
  ],
  [CHAIN.ETHERLINK]: [
    {
      symbol: "mTBILL",
      token: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
      oracle: "0x80dA45b66c4CBaB140aE53c9accB01BE4F41B7Dd",
      oracleAbi: abi.lastAnswer,
      oracleDecimals: 8,
      performanceFeeRate: 0,
      start: "2025-07-16",
    },
    {
      symbol: "mBASIS",
      token: "0x2247B5A46BB79421a314aB0f0b67fFd11dd37Ee4",
      oracle: "0x31D211312D9cF5A67436517C324504ebd5BD50a0",
      oracleAbi: abi.lastAnswer,
      oracleDecimals: 8,
      performanceFeeRate: 0.2,
      start: "2025-07-16",
    },
  ],
};

const toUSD = (
  supply: string,
  tokenDecimals: number,
  priceDelta: BigNumber,
  oracleDecimals: number
) => {
  return new BigNumber(supply)
    .times(priceDelta)
    .div(new BigNumber(10).pow(tokenDecimals))
    .div(new BigNumber(10).pow(oracleDecimals));
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const chainProducts = products[options.chain] ?? [];

  await Promise.all(
    chainProducts.map(async ({ token, oracle, oracleAbi, oracleDecimals, performanceFeeRate }) => {
      const [tokenDecimals, totalSupply, priceBefore, priceAfter] = await Promise.all([
        options.api.call({ target: token, abi: abi.decimals }),
        options.api.call({ target: token, abi: abi.totalSupply }),
        options.fromApi.call({ target: oracle, abi: oracleAbi }),
        options.toApi.call({ target: oracle, abi: oracleAbi }),
      ]);

      const priceDelta = new BigNumber(priceAfter).minus(priceBefore);
      if (priceDelta.lte(0)) return;

      const netYield = toUSD(totalSupply, Number(tokenDecimals), priceDelta, oracleDecimals);
      if (netYield.lte(0)) return;

      const grossYield = performanceFeeRate > 0
        ? netYield.div(1 - performanceFeeRate)
        : netYield;
      const protocolRevenue = grossYield.minus(netYield);

      dailyFees.addUSDValue(grossYield.toNumber(), METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.addUSDValue(netYield.toNumber(), METRIC.ASSETS_YIELDS);

      if (protocolRevenue.gt(0)) {
        dailyRevenue.addUSDValue(protocolRevenue.toNumber(), METRIC.PERFORMANCE_FEES);
        dailyProtocolRevenue.addUSDValue(protocolRevenue.toNumber(), METRIC.PERFORMANCE_FEES);
      }
    })
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  runAtCurrTime: true,
  adapter: Object.fromEntries(
    Object.entries(products).map(([chain, chainProducts]) => [
      chain,
      {
        fetch,
        start: chainProducts.reduce(
          (earliest, product) => product.start < earliest ? product.start : earliest,
          chainProducts[0]!.start
        ),
      },
    ])
  ),
  methodology: {
    Fees: "Positive daily NAV-per-token appreciation multiplied by token supply. For mBASIS, gross yield is reconstructed from net investor yield using the published 20% performance fee.",
    Revenue: "Midas performance fees from mBASIS yield.",
    ProtocolRevenue: "Midas performance fees from mBASIS yield.",
    SupplySideRevenue: "Net yield accruing to mToken holders through NAV appreciation.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Positive daily NAV-per-token appreciation across tracked Midas mTokens.",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "Performance fee share retained by Midas for mBASIS.",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "Performance fee share retained by Midas for mBASIS.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Net yield accruing to mToken holders.",
    },
  },
};

export default adapter;
