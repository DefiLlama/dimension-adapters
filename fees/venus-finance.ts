import { FetchOptions } from "../adapters/types";
import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

const comptrollerABI = {
  underlying: "address:underlying",
  getAllMarkets: "address[]:getAllMarkets",
  accrueInterest: "event AccrueInterest(uint256 cashPrior,uint256 interestAccumulated,uint256 borrowIndex,uint256 totalBorrows)",
  reserveFactor: "uint256:reserveFactorMantissa",
};

const comptrollers = {
  [CHAIN.BSC]: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  [CHAIN.ETHEREUM]: "0x687a01ecF6d3907658f7A7c714749fAC32336D1B",
  [CHAIN.OP_BNB]: "0xd6e3e2a1d8d95cae355d15b3b9f8e5c2511874dd",
  [CHAIN.ARBITRUM]: "0x317c1A5739F39046E20b08ac9BeEa3f10fD43326",
  [CHAIN.ERA]: "0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1",
  [CHAIN.BASE]: "0x0C7973F9598AA62f9e03B94E92C967fD5437426C",
  [CHAIN.OPTIMISM]: "0x5593FF68bE84C966821eEf5F0a988C285D5B7CeC",
  [CHAIN.UNICHAIN]: "0xe22af1e6b78318e1Fe1053Edbd7209b8Fc62c4Fe",
};

const protocolShareReserves: Record<string, string> = {
  [CHAIN.BSC]: "0xCa01D5A9A248a830E9D93231e791B1afFed7c446",
  [CHAIN.ETHEREUM]: "0x8c8c8530464f7D95552A11eC31Adbd4dC4AC4d3E",
  [CHAIN.OP_BNB]: "0xA2EDD515B75aBD009161B15909C19959484B0C1e",
  [CHAIN.ARBITRUM]: "0xF9263eaF7eB50815194f26aCcAB6765820B13D41",
  [CHAIN.ERA]: "0xA1193e941BDf34E858f7F276221B4886EfdD040b",
  [CHAIN.BASE]: "0x3565001d57c91062367C3792B74458e3c6eD910a",
  [CHAIN.OPTIMISM]: "0x735ed037cB0dAcf90B133370C33C08764f88140a",
  [CHAIN.UNICHAIN]: "0x0A93fBcd7B53CE6D335cAB6784927082AD75B242",
};

const liquidationIncomeType = 1;
const additionalRevenueSchema = 1;
const liquidationTreasuryShare = 60n;
const liquidationVaultShare = 20n;
const liquidationRiskFundShare = 20n;
const liquidationProtocolShare = liquidationTreasuryShare + liquidationRiskFundShare;
const liquidationHoldersShare = liquidationVaultShare;
const percentageDenominator = 100n;
const bscLogBlockRange = 75;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getLogsWithRetry = async (options: FetchOptions, params: Parameters<FetchOptions["getLogs"]>[0]) => {
  let lastError: any;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await options.getLogs(params);
    } catch (error) {
      lastError = error;
      await sleep((attempt + 1) * 250);
    }
  }

  throw lastError;
};

const getBscLogsByTargets = async (options: FetchOptions, eventAbi: string, targets: string[]) => {
  const targetSet = new Set(targets.map((target) => target.toLowerCase()));
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const logs: any[] = [];
  const ranges = [];

  for (let startBlock = fromBlock; startBlock <= toBlock; startBlock += bscLogBlockRange) {
    const endBlock = Math.min(startBlock + bscLogBlockRange - 1, toBlock);
    ranges.push({ fromBlock: startBlock, toBlock: endBlock });
  }

  for (let index = 0; index < ranges.length; index += 5) {
    const chunks = await Promise.all(ranges.slice(index, index + 5).map((range) => getLogsWithRetry(options, {
      noTarget: true,
      onlyArgs: false,
      eventAbi,
      ...range,
    })));

    chunks.flat().forEach((log: any) => {
      if (targetSet.has(log.address?.toLowerCase())) logs.push({ ...log.args, address: log.address });
    });
  }

  return logs;
};

const borrowInterest = async (comptroller: string, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const latestApi = new sdk.ChainApi({ chain: options.chain });
  const markets = await latestApi.call({ target: comptroller, abi: comptrollerABI.getAllMarkets });
  const underlyings = await latestApi.multiCall({ calls: markets, abi: comptrollerABI.underlying, permitFailure: true });
  const reserveFactors = await latestApi.multiCall({ calls: markets, abi: comptrollerABI.reserveFactor });
  const marketIndexes: Record<string, number> = {};
  markets.forEach((market: string, index: number) => {
    marketIndexes[market.toLowerCase()] = index;
  });
  const rawLogs = options.chain === CHAIN.BSC
    ? await getBscLogsByTargets(options, comptrollerABI.accrueInterest, markets)
    : (await options.getLogs({
      targets: markets,
      flatten: false,
      eventAbi: comptrollerABI.accrueInterest,
    })).map((log: any[], marketIndex: number) => log.map((event) => ({ ...event, marketIndex }))).flat();
  const logs = rawLogs.map((event: any) => ({
    ...event,
    marketIndex: event.marketIndex ?? marketIndexes[event.address?.toLowerCase()],
    interestAccumulated: Number(event.interestAccumulated),
  }));

  underlyings.forEach((underlying, index) => {
    if (!underlying) underlyings[index] = ADDRESSES.null;
  });

  logs.forEach((log) => {
    const underlying = underlyings[log.marketIndex];

    dailyFees.add(underlying, log.interestAccumulated, METRIC.BORROW_INTEREST);
    dailyRevenue.add(underlying, log.interestAccumulated * Number(reserveFactors[log.marketIndex]) / 1e18, METRIC.BORROW_INTEREST);
  });

  return { dailyFees, dailyRevenue };
};

const liquidationIncome = async (options: FetchOptions) => {
  const protocolShareReserve = protocolShareReserves[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  if (!protocolShareReserve) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
  }

  const eventAbi = "event AssetsReservesUpdated(address indexed comptroller, address indexed asset, uint256 amount, uint8 incomeType, uint8 schema)";
  const logs: any[] = options.chain === CHAIN.BSC
    ? await getBscLogsByTargets(options, eventAbi, [protocolShareReserve])
    : await options.getLogs({
      target: protocolShareReserve,
      eventAbi,
    });

  logs
    .filter((log: any) => Number(log.incomeType) === liquidationIncomeType && Number(log.schema) === additionalRevenueSchema)
    .forEach((log: any) => {
      const amount = BigInt(log.amount);

      dailyFees.add(log.asset, amount, METRIC.LIQUIDATION_FEES);
      dailyRevenue.add(log.asset, amount, METRIC.LIQUIDATION_FEES);
      dailyProtocolRevenue.add(log.asset, amount * liquidationProtocolShare / percentageDenominator, METRIC.LIQUIDATION_FEES);
      dailyHoldersRevenue.add(log.asset, amount * liquidationHoldersShare / percentageDenominator, METRIC.LIQUIDATION_FEES);
    });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const adapter = Object.fromEntries(Object.entries(comptrollers).map(([chain, comptroller]) => [
  chain,
  {
    fetch: async (options: FetchOptions) => {
      const { dailyFees, dailyRevenue } = await borrowInterest(comptroller, options);
      const dailyProtocolRevenue = dailyRevenue.clone(0.6);
      const dailyHoldersRevenue = dailyRevenue.clone(0.4);
      const dailySupplySideRevenue = options.createBalances();

      dailySupplySideRevenue.addBalances(dailyFees);
      Object.entries(dailyRevenue.getBalances()).forEach(([token, balance]) => {
        dailySupplySideRevenue.addTokenVannila(token, Number(balance) * -1, METRIC.BORROW_INTEREST);
      });

      const liquidation = await liquidationIncome(options);
      dailyFees.addBalances(liquidation.dailyFees);
      dailyRevenue.addBalances(liquidation.dailyRevenue);
      dailyProtocolRevenue.addBalances(liquidation.dailyProtocolRevenue);
      dailyHoldersRevenue.addBalances(liquidation.dailyHoldersRevenue);

      return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
    },
  },
]));

export default {
  adapter,
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "Total interest paid by borrowers and liquidation income received by ProtocolShareReserve.",
    Revenue: "Protocol and holders share of borrow interest, plus liquidation income received by ProtocolShareReserve.",
    ProtocolRevenue: "60% of borrow interest revenue, plus the Treasury and Risk Fund shares of ProtocolShareReserve liquidation income.",
    HoldersRevenue: "40% of borrow interest revenue, plus the XVS Vault rewards share of ProtocolShareReserve liquidation income.",
    SupplySideRevenue: "Interest paid to lenders in liquidity pools.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Total interest paid by borrowers.",
      [METRIC.LIQUIDATION_FEES]: "Liquidation income tracked from ProtocolShareReserve AssetsReservesUpdated events.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Share of borrow interest to Venus protocol and XVS holders.",
      [METRIC.LIQUIDATION_FEES]: "Liquidation income tracked from ProtocolShareReserve AssetsReservesUpdated events.",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "60% of borrow interest revenue.",
      [METRIC.LIQUIDATION_FEES]: "80% Treasury and Risk Fund shares of ProtocolShareReserve liquidation income.",
    },
    HoldersRevenue: {
      [METRIC.BORROW_INTEREST]: "40% of borrow interest revenue.",
      [METRIC.LIQUIDATION_FEES]: "20% XVS Vault rewards share of ProtocolShareReserve liquidation income.",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Borrow interest distributed to suppliers and lenders.",
    },
  },
};
