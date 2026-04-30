// https://docs.spiko.xyz/spiko-mmfs/fees

import BigNumber from "bignumber.js";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

type FundConfig = {
  token: string;
  oracle: string;
};

const funds: Record<string, Record<string, FundConfig>> = {
  [CHAIN.ETHEREUM]: {
    EUTBL: {
      token: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
      oracle: "0x29503f31B73F0734455942Eb888E13acA1588a4e",
    },
    USTBL: {
      token: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
      oracle: "0x021289588cd81dC1AC87ea91e91607eEF68303F5",
    },
  },
  [CHAIN.POLYGON]: {
    EUTBL: {
      token: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
      oracle: "0x29503f31B73F0734455942Eb888E13acA1588a4e",
    },
    USTBL: {
      token: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
      oracle: "0x021289588cd81dC1AC87ea91e91607eEF68303F5",
    },
  },
};

const ORACLE_PRICE_ABI =
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)";
const ORACLE_DECIMALS = 6;
const MANAGEMENT_FEE_RATE = 0.25 / 100;
const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

const getOracleAnswer = (priceData: any) =>
  new BigNumber((priceData.answer ?? priceData[1]).toString());

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { api, createBalances, chain, fromApi, toApi } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const chainFunds = Object.values(funds[chain]);
  const tokens = chainFunds.map(({ token }) => token);
  const oracles = chainFunds.map(({ oracle }) => oracle);

  const [totalSuppliesBefore, totalSuppliesAfter, pricesBefore, pricesAfter] =
    await Promise.all([
      fromApi.multiCall({
        calls: tokens,
        abi: "erc20:totalSupply",
      }),
      toApi.multiCall({
        calls: tokens,
        abi: "erc20:totalSupply",
      }),
      fromApi.multiCall({
        calls: oracles,
        abi: ORACLE_PRICE_ABI,
      }),
      toApi.multiCall({
        calls: oracles,
        abi: ORACLE_PRICE_ABI,
      }),
    ]);

  const periodInYears = new BigNumber(options.toTimestamp - options.fromTimestamp).div(
    YEAR_IN_SECONDS,
  );

  chainFunds.forEach(({ token }, index) => {
    const totalSupplyBefore = new BigNumber(totalSuppliesBefore[index].toString());
    const totalSupplyAfter = new BigNumber(totalSuppliesAfter[index].toString());
    const averageSupply = totalSupplyBefore.plus(totalSupplyAfter).div(2);
    const priceBefore = getOracleAnswer(pricesBefore[index]).div(10 ** ORACLE_DECIMALS);
    const priceAfter = getOracleAnswer(pricesAfter[index]).div(10 ** ORACLE_DECIMALS);

    const priceIncrease = priceAfter.minus(priceBefore);
    if (priceAfter.gt(0) && priceIncrease.gt(0)) {
      const assetYield = averageSupply.times(priceIncrease).div(priceAfter);
      dailyFees.add(token, assetYield.toNumber(), METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(token, assetYield.toNumber(), METRIC.ASSETS_YIELDS);
    }

    const managementFee = averageSupply.times(MANAGEMENT_FEE_RATE).times(periodInYears);
    dailyFees.add(token, managementFee.toNumber(), METRIC.MANAGEMENT_FEES);
    dailyRevenue.add(token, managementFee.toNumber(), METRIC.MANAGEMENT_FEES);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Includes positive NAV growth from EUTBL/USTBL asset yields and Spiko's annual management fee.",
  Revenue: "Spiko management fees, charged at 0.25% annually on fund assets.",
  ProtocolRevenue: "Spiko management fees, charged at 0.25% annually on fund assets.",
  SupplySideRevenue: "Positive NAV growth from EUTBL and USTBL asset yields distributed to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Positive EUTBL/USTBL NAV growth from the official Spiko on-chain oracle.",
    [METRIC.MANAGEMENT_FEES]: "0.25% annual management fee charged on fund assets.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "0.25% annual management fee charged on fund assets.",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "0.25% annual management fee charged on fund assets.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Positive EUTBL/USTBL NAV growth from the official Spiko on-chain oracle.",
  },
  HoldersRevenue: {},
};

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-05-01',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2024-04-20',
    },
  },
};

export default adapter;
