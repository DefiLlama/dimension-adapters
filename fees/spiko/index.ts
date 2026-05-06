// https://docs.spiko.xyz/spiko-mmfs/fees
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

type FundConfig = {
  token: string;
  oracle: string;
  asset: string;
};

const funds: Record<string, Record<string, FundConfig>> = {
  [CHAIN.ETHEREUM]: {
    EUTBL: {
      token: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
      oracle: "0x29503f31B73F0734455942Eb888E13acA1588a4e",
      asset: "euro-coin"
    },
    USTBL: {
      token: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
      oracle: "0x021289588cd81dC1AC87ea91e91607eEF68303F5",
      asset: "usd-coin"
    },
  },
  [CHAIN.POLYGON]: {
    EUTBL: {
      token: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
      oracle: "0x29503f31B73F0734455942Eb888E13acA1588a4e",
      asset: "euro-coin"
    },
    USTBL: {
      token: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
      oracle: "0x021289588cd81dC1AC87ea91e91607eEF68303F5",
      asset: "usd-coin"
    },
  },
};

const ORACLE_PRICE_ABI =
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)";;
const MANAGEMENT_FEE_RATE = 0.25 / 100;
const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const ORACLE_DECIMALS = 6;
const TOKEN_DECIMALS = 5;


const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { createBalances, chain, fromApi, toApi, fromTimestamp, toTimestamp } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const chainFunds = Object.values(funds[chain]);
  const tokens = chainFunds.map(({ token }) => token);
  const oracles = chainFunds.map(({ oracle }) => oracle);

  const [totalSupplies, pricesBefore, pricesAfter] =
    await Promise.all([
      toApi.multiCall({
        calls: tokens,
        abi: "erc20:totalSupply",
        permitFailure: true,
      }),
      fromApi.multiCall({
        calls: oracles,
        abi: ORACLE_PRICE_ABI,
        permitFailure: true,
      }),
      toApi.multiCall({
        calls: oracles,
        abi: ORACLE_PRICE_ABI,
        permitFailure: true,
      }),
    ]);

  const periodInYears = (toTimestamp - fromTimestamp) / YEAR_IN_SECONDS;

  chainFunds.forEach(({ asset }, index) => {
    if (!totalSupplies[index] || !pricesBefore[index] || !pricesAfter[index]) return;

    const totalSupply = totalSupplies[index] / (10 ** TOKEN_DECIMALS);
    const oraclePriceBefore = Number(pricesBefore[index].answer);
    const oraclePriceAfter = Number(pricesAfter[index].answer);

    const priceChange = (oraclePriceAfter - oraclePriceBefore) / (10 ** ORACLE_DECIMALS);
    const assetYield = totalSupply * priceChange;

    dailyFees.addCGToken(asset, assetYield, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.addCGToken(asset, assetYield, METRIC.ASSETS_YIELDS);

    const managementFee = totalSupply * MANAGEMENT_FEE_RATE * periodInYears;
    dailyFees.addCGToken(asset, managementFee, METRIC.MANAGEMENT_FEES);
    dailyRevenue.addCGToken(asset, managementFee, METRIC.MANAGEMENT_FEES);
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
};

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2024-05-01',
    },
    [CHAIN.POLYGON]: {
      start: '2024-04-20',
    },
  },
};

export default adapter;
