import { compoundV2Export } from "../helpers/compoundV2";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";
import { FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

type Config = {
  comptrollers: Record<string, string>;
  options?: Record<string, any>;
};

const venusProtocolShareReserves: Record<string, string> = {
  [CHAIN.BSC]: "0xCa01D5A9A248a830E9D93231e791B1afFed7c446",
  [CHAIN.ETHEREUM]: "0x8c8c8530464f7D95552A11eC31Adbd4dC4AC4d3E",
  [CHAIN.OP_BNB]: "0xA2EDD515B75aBD009161B15909C19959484B0C1e",
  [CHAIN.ARBITRUM]: "0xF9263eaF7eB50815194f26aCcAB6765820B13D41",
  [CHAIN.ERA]: "0xA1193e941BDf34E858f7F276221B4886EfdD040b",
  [CHAIN.BASE]: "0x3565001d57c91062367C3792B74458e3c6eD910a",
  [CHAIN.OPTIMISM]: "0x735ed037cB0dAcf90B133370C33C08764f88140a",
  [CHAIN.UNICHAIN]: "0x0A93fBcd7B53CE6D335cAB6784927082AD75B242",
};

const venusLiquidationIncomeType = 1;
const venusAdditionalRevenueSchema = 1;
const venusLiquidationProtocolShare = 25n;
const venusLiquidationHoldersShare = 75n;
const percentageDenominator = 100n;

const venusLiquidationIncome = async (options: FetchOptions) => {
  const protocolShareReserve = venusProtocolShareReserves[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  if (!protocolShareReserve) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
  }

  const logs = await options.getLogs({
    target: protocolShareReserve,
    eventAbi: "event AssetsReservesUpdated(address indexed comptroller, address indexed asset, uint256 amount, uint8 incomeType, uint8 schema)",
  });

  logs
    .filter((log: any) => Number(log.incomeType) === venusLiquidationIncomeType && Number(log.schema) === venusAdditionalRevenueSchema)
    .forEach((log: any) => {
      const amount = BigInt(log.amount);

      dailyFees.add(log.asset, amount, METRIC.LIQUIDATION_FEES);
      dailyRevenue.add(log.asset, amount, METRIC.LIQUIDATION_FEES);
      dailyProtocolRevenue.add(log.asset, amount * venusLiquidationProtocolShare / percentageDenominator, METRIC.LIQUIDATION_FEES);
      dailyHoldersRevenue.add(log.asset, amount * venusLiquidationHoldersShare / percentageDenominator, METRIC.LIQUIDATION_FEES);
    });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const feesConfigs: Record<string, Config> = {
  "benqi-lending": {
    comptrollers: { [CHAIN.AVAX]: "0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4" },
    options: { holdersRevenueRatio: 0, protocolRevenueRatio: 1 },
  },
  "canto-lending": {
    comptrollers: { [CHAIN.CANTO]: "0x5E23dC409Fc2F832f83CEc191E245A191a4bCc5C" },
    options: { protocolRevenueRatio: 1 },
  },
  "capyfi": {
    comptrollers: { [CHAIN.ETHEREUM]: "0x0b9af1fd73885aD52680A1aeAa7A3f17AC702afA", [CHAIN.WC]: "0x589d63300976759a0fc74ea6fA7D951f581252D7" },
    options: { protocolRevenueRatio: 1, blacklists: ["0xbaa6bc4e24686d710b9318b49b0bb16ec7c46bfa"] },
  },
  "deepr-finance": {
    comptrollers: { [CHAIN.SHIMMER_EVM]: "0xF7E452A8685D57083Edf4e4CC8064EcDcF71D7B7", [CHAIN.IOTAEVM]: "0xee07121d97FDEA35675e02017837a7a43aeDa48F" },
    options: { holdersRevenueRatio: 1 },
  },
  "elara": {
    comptrollers: { [CHAIN.ZIRCUIT]: "0x695aCEf58D1a10Cf13CBb4bbB2dfB7eDDd89B296" },
    options: { protocolRevenueRatio: 1 },
  },
  "fluxfinance": {
    comptrollers: { [CHAIN.ETHEREUM]: "0x95Af143a021DF745bc78e845b54591C53a8B3A51" },
    options: { protocolRevenueRatio: 1 },
  },
  "hover": {
    comptrollers: { [CHAIN.KAVA]: "0x3A4Ec955a18eF6eB33025599505E7d404a4d59eC" },
  },
  "machfi": {
    comptrollers: { [CHAIN.SONIC]: "0x646F91AbD5Ab94B76d1F9C5D9490A2f6DDf25730" },
    options: { protocolRevenueRatio: 1 },
  },
  "mendi-finance": {
    comptrollers: { [CHAIN.LINEA]: "0x1b4d3b0421dDc1eB216D230Bc01527422Fb93103" },
    options: { holdersRevenueRatio: 1, protocolRevenueRatio: 0 },
  },
  "morpho-compound": {
    comptrollers: { [CHAIN.ETHEREUM]: "0x930f1b46e1d081ec1524efd95752be3ece51ef67" },
  },
  "qie-lend": {
    comptrollers: { [CHAIN.QIEV3]: "0x69a31E3D361C69B37463aa67Ef93067dC760fBD4"},
  },
  "strike": {
    comptrollers: { [CHAIN.ETHEREUM]: "0xe2e17b2CBbf48211FA7eB8A875360e5e39bA2602" },
    options: { useExchangeRate: true, blacklists: ["0xc13fdf3af7ec87dca256d9c11ff96405d360f522", "0x1ebfd36223079dc79fefc62260db9e25f3f5e2c7"], protocolRevenueRatio: 1 },
  },
  "sumer": {
    comptrollers: { [CHAIN.METER]: "0xcB4cdDA50C1B6B0E33F544c98420722093B7Aa88", [CHAIN.BASE]: "0x611375907733D9576907E125Fb29704712F0BAfA", [CHAIN.ARBITRUM]: "0xBfb69860C91A22A2287df1Ff3Cdf0476c5aab24A", [CHAIN.ETHEREUM]: "0x60A4570bE892fb41280eDFE9DB75e1a62C70456F", [CHAIN.ZKLINK]: "0xe6099D924efEf37845867D45E3362731EaF8A98D", [CHAIN.BSQUARED]: "0xdD9C863197df28f47721107f94eb031b548B5e48", [CHAIN.CORE]: "0x7f5a7aE2688A7ba6a9B36141335044c058a08b3E", [CHAIN.BSC]: "0x15B5220024c3242F7D61177D6ff715cfac4909eD", [CHAIN.BERACHAIN]: "0x16C7d1F9EA48F7DE5E8bc3165A04E8340Da574fA", [CHAIN.HEMI]: "0xB2fF02eEF85DC4eaE95Ab32AA887E0cC69DF8d8E", [CHAIN.MONAD]: "0x2d9b96648C784906253c7FA94817437EF59Cf226" },
    options: { protocolRevenueRatio: 1 },
  },
  "takara-lend": {
    comptrollers: { [CHAIN.SEI]: "0x71034bf5eC0FAd7aEE81a213403c8892F3d8CAeE" },
    options: { useExchangeRate: true, protocolRevenueRatio: 1 },
  },
  "traderjoe-lend": {
    comptrollers: { [CHAIN.AVAX]: "0xdc13687554205E5b89Ac783db14bb5bba4A1eDaC" },
    options: { protocolRevenueRatio: 1 },
  },
  "venus-finance": {
    comptrollers: { [CHAIN.BSC]: "0xfD36E2c2a6789Db23113685031d7F16329158384", [CHAIN.ETHEREUM]: "0x687a01ecF6d3907658f7A7c714749fAC32336D1B", [CHAIN.OP_BNB]: "0xd6e3e2a1d8d95cae355d15b3b9f8e5c2511874dd", [CHAIN.ARBITRUM]: "0x317c1A5739F39046E20b08ac9BeEa3f10fD43326", [CHAIN.ERA]: "0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1", [CHAIN.BASE]: "0x0C7973F9598AA62f9e03B94E92C967fD5437426C", [CHAIN.OPTIMISM]: "0x5593FF68bE84C966821eEf5F0a988C285D5B7CeC", [CHAIN.UNICHAIN]: "0xe22af1e6b78318e1Fe1053Edbd7209b8Fc62c4Fe" },
    options: {
      protocolRevenueRatio: 0.6,
      holdersRevenueRatio: 0.4,
      extraFees: venusLiquidationIncome,
      methodology: {
        Fees: "Total interest paid by borrowers and liquidation income received by ProtocolShareReserve.",
        Revenue: "Protocol and holders share of borrow interest, plus liquidation income received by ProtocolShareReserve.",
        ProtocolRevenue: "60% of borrow interest revenue, plus the 25% BNB burn share of ProtocolShareReserve liquidation income.",
        HoldersRevenue: "40% of borrow interest revenue, plus the 75% XVS holder share of ProtocolShareReserve liquidation income.",
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
          [METRIC.LIQUIDATION_FEES]: "25% BNB burn share of ProtocolShareReserve liquidation income.",
        },
        HoldersRevenue: {
          [METRIC.BORROW_INTEREST]: "40% of borrow interest revenue.",
          [METRIC.LIQUIDATION_FEES]: "75% XVS holder share of ProtocolShareReserve liquidation income.",
        },
        SupplySideRevenue: {
          [METRIC.BORROW_INTEREST]: "Borrow interest distributed to suppliers and lenders.",
        },
      },
    },
  },
  "mare-finance-v2": {
    comptrollers: { [CHAIN.KAVA]: "0xFcD7D41D5cfF03C7f6D573c9732B0506C72f5C72" },
  },
  "quantus": {
    comptrollers: {
      [CHAIN.MONAD]: '0xFc57bF0733e5e65d8549fc2922919Cfb97e62D5f',
      [CHAIN.MEGAETH]: '0x1F1416EbbeAb7a13fC5B6111A1E77696Be600413',
    },
  },
  'xpert': {
    comptrollers: {
      [CHAIN.INK]: '0x4f3b08B7FE4E14f728d084850A7B9CFF2E759Eb7',
    }, options: { start: {
      [CHAIN.INK]: '2026-03-17',
    } },
  },
};

const feesProtocols: Record<string, any> = {};
for (const [name, { comptrollers, options }] of Object.entries(feesConfigs)) {
  feesProtocols[name] = compoundV2Export(comptrollers, options);
}


export const { protocolList, getAdapter } = createFactoryExports(feesProtocols);
