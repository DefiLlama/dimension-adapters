import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { compoundV2Export } from "../helpers/compoundV2";
import { METRIC } from "../helpers/metrics";

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

const liquidationIncome = async (options: FetchOptions) => {
  const protocolShareReserve = protocolShareReserves[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  if (!protocolShareReserve) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
  }

  const logs: any[] = await options.getLogs({
    target: protocolShareReserve,
    eventAbi: "event AssetsReservesUpdated(address indexed comptroller, address indexed asset, uint256 amount, uint8 incomeType, uint8 schema)",
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

export default compoundV2Export(comptrollers, {
  protocolRevenueRatio: 0.6,
  holdersRevenueRatio: 0.4,
  pullHourly: true,
  extraFees: liquidationIncome,
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
});
