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

const configs: any = {
  [CHAIN.BSC]: {
    comptroller: '0xfD36E2c2a6789Db23113685031d7F16329158384',
    protocolShareReserves: '0xCa01D5A9A248a830E9D93231e791B1afFed7c446',
    start: '2020-11-23',
  },
  [CHAIN.ETHEREUM]: {
    comptroller: '0x687a01ecF6d3907658f7A7c714749fAC32336D1B',
    protocolShareReserves: '0x8c8c8530464f7D95552A11eC31Adbd4dC4AC4d3E',
    start: '2024-01-10',
  },
  [CHAIN.OP_BNB]: {
    comptroller: '0xd6e3e2a1d8d95cae355d15b3b9f8e5c2511874dd',
    protocolShareReserves: '0xA2EDD515B75aBD009161B15909C19959484B0C1e',
    start: '2024-02-16',
  },
  [CHAIN.ARBITRUM]: {
    comptroller: '0x317c1A5739F39046E20b08ac9BeEa3f10fD43326',
    protocolShareReserves: '0xF9263eaF7eB50815194f26aCcAB6765820B13D41',
    start: '2024-05-30',
  },
  [CHAIN.ERA]: {
    comptroller: '0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1',
    protocolShareReserves: '0xA1193e941BDf34E858f7F276221B4886EfdD040b',
    start: '2020-11-23',
  },
  [CHAIN.BASE]: {
    comptroller: '0x0C7973F9598AA62f9e03B94E92C967fD5437426C',
    protocolShareReserves: '0x3565001d57c91062367C3792B74458e3c6eD910a',
    start: '2020-11-23',
  },
  [CHAIN.OPTIMISM]: {
    comptroller: '0x5593FF68bE84C966821eEf5F0a988C285D5B7CeC',
    start: '2020-11-23',
  },
  [CHAIN.UNICHAIN]: {
    comptroller: '0xe22af1e6b78318e1Fe1053Edbd7209b8Fc62c4Fe',
    protocolShareReserves: '0x0A93fBcd7B53CE6D335cAB6784927082AD75B242',
    start: '2020-11-23',
  },
};

const liquidationIncomeType = 1;
const additionalRevenueSchema = 1;
const liquidationTreasuryShare = 60n;
const liquidationVaultShare = 20n;
const liquidationRiskFundShare = 20n;
const liquidationProtocolShare = liquidationTreasuryShare + liquidationRiskFundShare;
const liquidationHoldersShare = liquidationVaultShare;
const percentageDenominator = 100n;

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
  const rawLogs = (await options.getLogs({
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

const liquidationIncome = async (protocolShareReserve: string, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  if (!protocolShareReserve) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
  }

  const eventAbi = "event AssetsReservesUpdated(address indexed comptroller, address indexed asset, uint256 amount, uint8 incomeType, uint8 schema)";
  const logs: any[] = await options.getLogs({
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

const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue } = await borrowInterest(configs[options.chain].comptroller, options);
  const dailyProtocolRevenue = dailyRevenue.clone(0.6);
  const dailyHoldersRevenue = dailyRevenue.clone(0.4);
  const dailySupplySideRevenue = options.createBalances();
  
  dailySupplySideRevenue.addBalances(dailyFees);
  Object.entries(dailyRevenue.getBalances()).forEach(([token, balance]) => {
    dailySupplySideRevenue.addTokenVannila(token, Number(balance) * -1, METRIC.BORROW_INTEREST);
  });
  
  const liquidation = await liquidationIncome(configs[options.chain].protocolShareReserves, options);
  dailyFees.addBalances(liquidation.dailyFees);
  dailyRevenue.addBalances(liquidation.dailyRevenue);
  dailyProtocolRevenue.addBalances(liquidation.dailyProtocolRevenue);
  dailyHoldersRevenue.addBalances(liquidation.dailyHoldersRevenue);
  
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
}

export default {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: configs,
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
