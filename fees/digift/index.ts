import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { METRIC } from "../../helpers/metrics";
import * as sdk from "@defillama/sdk";

type ChainConfig = {
  fetch?: (options: FetchOptions) => Promise<any>;
  start: string;
  token: string;
  tokenDecimals: number;
  manager: string;
  subManagement: string | null;
  navManager: string | null;
};

const chainConfig = {
  [CHAIN.ETHEREUM]: {
    start: "2024-05-24",
    token: "0x50293DD8889B931EB3441d2664dce8396640B419",
    tokenDecimals: 6,
    manager: "0x9056777AD890ECe386D646a5c698a9A6a779000B",
    subManagement: "0x3797C46db697c24a983222c335F17Ba28e8c5b69",
    navManager: null,
  },
  [CHAIN.ARBITRUM]: {
    start: "2025-07-23",
    token: "0xc26af85ede9cc25d449bcebef866bb85afd5d346",
    tokenDecimals: 6,
    manager: "0x33A5038ad4D4185c4719C3bE2CFBF56327E334F0",
    subManagement: null,
    navManager: null,
  },
  [CHAIN.AVAX]: {
    start: "2025-10-02",
    token: "0x51626db85482b2fa9901271c18627ebefa8875ac",
    tokenDecimals: 6,
    manager: "0xda92C74bE76ac8FDC040A88CffA4D302DCf1A54c",
    subManagement: null,
    navManager: null,
  },
  [CHAIN.SOLANA]: {
    fetch: fetchSolana,
    start: "2025-12-05",
    token: "9DRPPWYud8i6CaSsDsFESs1xyVr8dBCMtjPZji2xiZEa",
    tokenDecimals: 6,
    manager: "FQ9X5cF6oWmGcH6XAsdkPwBj2mKWRoTXU2zGS1gCgBaJ",
    subManagement: null,
    navManager: "0x9056777AD890ECe386D646a5c698a9A6a779000B",
  },
} satisfies Record<string, ChainConfig>;

// DigiFT managers return NAV as USD with 6 decimals. After removing this
// exchange-rate scale, values are still in ULTRA token raw units.
const EXCHANGE_RATE_SCALE = 1_000_000n;
const MANAGEMENT_FEE_NUMERATOR = 15n; // 0.15% annual management fee.
const MANAGEMENT_FEE_DENOMINATOR = 10_000n;
const ONE_YEAR = 365n * 24n * 60n * 60n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const config = chainConfig[options.chain as keyof typeof chainConfig];

  const [rateStart, rateEnd, supply] = await Promise.all([
    options.fromApi.call({ target: config.manager, abi: "uint256:lastSetMintExchangeRate" }),
    options.toApi.call({ target: config.manager, abi: "uint256:lastSetMintExchangeRate" }),
    options.toApi.call({ target: config.token, abi: "uint256:totalSupply" }),
  ]);

  if (config.subManagement) {
    const platformFeeLogs = await options.getLogs({
      target: config.subManagement,
      eventAbi: "event TransferPlatformFee(address indexed from, address indexed token, uint256 amount)",
    });

    platformFeeLogs.forEach((log) => {
      dailyFees.add(log.token, log.amount, METRIC.MINT_REDEEM_FEES);
      dailyRevenue.add(log.token, log.amount, METRIC.MINT_REDEEM_FEES);
    });
  }

  const supplyRaw = BigInt(supply);
  const navYield = (supplyRaw * (BigInt(rateEnd) - BigInt(rateStart))) / EXCHANGE_RATE_SCALE;
  const aum = (supplyRaw * BigInt(rateEnd)) / EXCHANGE_RATE_SCALE;
  const managementFees = (aum * MANAGEMENT_FEE_NUMERATOR * BigInt(options.toTimestamp - options.fromTimestamp)) / (MANAGEMENT_FEE_DENOMINATOR * ONE_YEAR);
  const navYieldUsd = Number(navYield) / 10 ** config.tokenDecimals;
  const managementFeesUsd = Number(managementFees) / 10 ** config.tokenDecimals;

  dailyFees.addUSDValue(navYieldUsd, METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.addUSDValue(navYieldUsd, METRIC.ASSETS_YIELDS);
  dailyFees.addUSDValue(managementFeesUsd, METRIC.MANAGEMENT_FEES);
  dailyRevenue.addUSDValue(managementFeesUsd, METRIC.MANAGEMENT_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

async function fetchSolana(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const config = chainConfig[CHAIN.SOLANA];

  const [rateFromBlock, rateToBlock, supply] = await Promise.all([
    sdk.blocks.getBlockNumber(CHAIN.ETHEREUM, options.fromTimestamp),
    sdk.blocks.getBlockNumber(CHAIN.ETHEREUM, options.toTimestamp),
    queryAllium(`
      SELECT CAST(total_supply AS VARCHAR) AS supply
      FROM solana.raw.spl_token_total_supply
      WHERE mint = '${config.token}'
        AND block_timestamp <= TO_TIMESTAMP_NTZ(${options.toTimestamp})
      ORDER BY block_timestamp DESC
      LIMIT 1
    `).then((res: any[]) => String(res[0]?.supply ?? 0).split(".")[0]),
  ]);

  const [rateStart, rateEnd] = await Promise.all([
    new sdk.ChainApi({ chain: CHAIN.ETHEREUM, block: rateFromBlock }).call({ target: config.navManager, abi: "uint256:lastSetMintExchangeRate" }),
    new sdk.ChainApi({ chain: CHAIN.ETHEREUM, block: rateToBlock }).call({ target: config.navManager, abi: "uint256:lastSetMintExchangeRate" }),
  ]);

  const supplyRaw = BigInt(supply);
  const navYield = (supplyRaw * (BigInt(rateEnd) - BigInt(rateStart))) / EXCHANGE_RATE_SCALE;
  const aum = (supplyRaw * BigInt(rateEnd)) / EXCHANGE_RATE_SCALE;
  const managementFees = (aum * MANAGEMENT_FEE_NUMERATOR * BigInt(options.toTimestamp - options.fromTimestamp)) / (MANAGEMENT_FEE_DENOMINATOR * ONE_YEAR);
  const navYieldUsd = Number(navYield) / 10 ** config.tokenDecimals;
  const managementFeesUsd = Number(managementFees) / 10 ** config.tokenDecimals;

  dailyFees.addUSDValue(navYieldUsd, METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.addUSDValue(navYieldUsd, METRIC.ASSETS_YIELDS);
  dailyFees.addUSDValue(managementFeesUsd, METRIC.MANAGEMENT_FEES);
  dailyRevenue.addUSDValue(managementFeesUsd, METRIC.MANAGEMENT_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  allowNegativeValue: true,
  methodology: {
    Fees: "Platform fees on subscription and redemption of tokens, plus ULTRA yield from NAV growth and the 0.15% annual management fee.",
    Revenue: "Platform fees paid by users on subscription and redemption, plus the 0.15% annual management fee charged on ULTRA assets under management.",
    ProtocolRevenue: "Platform fees and management fees are attributed to the protocol.",
    SupplySideRevenue: "ULTRA NAV growth distributed to token holders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: "Platform fees collected on subscription and redemption of DigiFT tokens.",
      [METRIC.ASSETS_YIELDS]: "ULTRA yield calculated from growth in NAV value.",
      [METRIC.MANAGEMENT_FEES]: "0.15% annual management fee applied to ULTRA assets under management.",
    },
    Revenue: {
      [METRIC.MINT_REDEEM_FEES]: "Platform fees collected by the protocol on subscription and redemption of DigiFT tokens.",
      [METRIC.MANAGEMENT_FEES]: "0.15% annual management fee applied to ULTRA assets under management.",
    },
    ProtocolRevenue: {
      [METRIC.MINT_REDEEM_FEES]: "Platform fees collected by the protocol on subscription and redemption of DigiFT tokens.",
      [METRIC.MANAGEMENT_FEES]: "0.15% annual management fee applied to ULTRA assets under management.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "ULTRA NAV growth distributed to token holders.",
    },
  },
};

export default adapter;
