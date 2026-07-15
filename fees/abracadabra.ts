import { ChainApi } from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getConfig } from "../helpers/cache";
import { METRIC } from "../helpers/metrics";

const MIM = "magic-internet-money";
const BORROW_FEES = "Borrow Fees";

// CauldronRegistry is deployed at the same address on every supported chain and
// enumerates all Abracadabra cauldrons (active + deprecated), see
// https://github.com/Abracadabra-money/abracadabra-money-contracts/blob/main/src/periphery/CauldronRegistry.sol
const CAULDRON_REGISTRY = "0xefCDC6FB4973aC30325Fb2B39e1a2F384E254b7A";

const ABI = {
  REGISTRY_LENGTH: "uint256:length",
  REGISTRY_CAULDRONS: "function cauldrons(uint256) view returns (address cauldron, uint8 version, bool deprecated)",
  BORROW_OPENING_FEE: "uint256:BORROW_OPENING_FEE",
  LIQUIDATION_MULTIPLIER: "uint256:LIQUIDATION_MULTIPLIER",
};

const EVENT = {
  // interest accrued on outstanding MIM debt, added to the protocol's feesEarned
  LOG_ACCRUE: "event LogAccrue(uint128 accruedAmount)",
  // amount = principal + opening fee (see CauldronV2+._borrow)
  LOG_BORROW: "event LogBorrow(address indexed from, address indexed to, uint256 amount, uint256 part)",
  // emitted by CauldronV3+ only, older CauldronV2 markets have no liquidation event
  LOG_LIQUIDATION: "event LogLiquidation(address indexed from, address indexed user, address indexed to, uint256 collateralShare, uint256 borrowAmount, uint256 borrowPart)",
};

// BORROW_OPENING_FEE_PRECISION / LIQUIDATION_MULTIPLIER_PRECISION in cauldron contracts
// https://github.com/Abracadabra-money/abracadabra-money-contracts/blob/main/src/cauldrons/CauldronV4.sol
const FEE_PRECISION = 1e5;
// 10% of the liquidation penalty accrues to the protocol, 90% is the liquidator's incentive
// https://docs.abracadabra.money/learn/intro/cauldrons/liquidations
const LIQUIDATION_DISTRIBUTION_PART = 0.1;
// protocol revenue is split 50% to SPELL buybacks / mSPELL stakers (holders)
// and 50% to the treasury
// https://docs.abracadabra.money/learn/tokens/tokenomics
const REVENUE_TO_HOLDERS = 0.5;

const getCauldrons = async (options: FetchOptions): Promise<Array<string>> => {
  return getConfig(`abracadabra/${options.chain}`, undefined, {
    fetcher: async () => {
      const api = new ChainApi({ chain: options.chain });
      const length = await api.call({ target: CAULDRON_REGISTRY, abi: ABI.REGISTRY_LENGTH });
      const cauldronInfos = await api.multiCall({
        target: CAULDRON_REGISTRY,
        abi: ABI.REGISTRY_CAULDRONS,
        calls: Array.from({ length: Number(length) }, (_, i) => ({ params: [i] })),
      });
      // v1 cauldrons (5 deprecated 2021 markets on Ethereum) use different
      // Kashi-style event signatures and are excluded
      return cauldronInfos
        .filter((info: any) => Number(info.version) >= 2)
        .map((info: any) => info.cauldron);
    },
  });
};

const fetch = async (options: FetchOptions) => {
  const cauldrons = await getCauldrons(options);

  const [borrowOpeningFees, liquidationMultipliers] = await Promise.all([
    options.api.multiCall({ abi: ABI.BORROW_OPENING_FEE, calls: cauldrons, permitFailure: true }),
    options.api.multiCall({ abi: ABI.LIQUIDATION_MULTIPLIER, calls: cauldrons, permitFailure: true }),
  ]);

  const openingFeeByCauldron: Record<string, number> = {};
  const liquidationMultiplierByCauldron: Record<string, number> = {};
  cauldrons.forEach((cauldron, i) => {
    openingFeeByCauldron[cauldron.toLowerCase()] = borrowOpeningFees[i] !== null ? Number(borrowOpeningFees[i]) : 0;
    liquidationMultiplierByCauldron[cauldron.toLowerCase()] = liquidationMultipliers[i] !== null ? Number(liquidationMultipliers[i]) : FEE_PRECISION;
  });

  const [accrueLogs, borrowLogs, liquidationLogs] = await Promise.all([
    options.getLogs({ targets: cauldrons, eventAbi: EVENT.LOG_ACCRUE }),
    options.getLogs({ targets: cauldrons, eventAbi: EVENT.LOG_BORROW, entireLog: true, parseLog: true }),
    options.getLogs({ targets: cauldrons, eventAbi: EVENT.LOG_LIQUIDATION, entireLog: true, parseLog: true }),
  ]);

  let interestFees = 0;
  let borrowFees = 0;
  let liquidationFees = 0;

  accrueLogs.forEach((log: any) => {
    interestFees += Number(log.accruedAmount) / 1e18;
  });

  borrowLogs.forEach((log: any) => {
    // event amount already includes the opening fee: amount = principal * (1 + fee)
    const fee = openingFeeByCauldron[log.address.toLowerCase()];
    borrowFees += (Number(log.args.amount) / 1e18) * fee / (FEE_PRECISION + fee);
  });

  liquidationLogs.forEach((log: any) => {
    // liquidation penalty paid by the borrower: borrowAmount * (multiplier - 1)
    const multiplier = liquidationMultiplierByCauldron[log.address.toLowerCase()];
    liquidationFees += (Number(log.args.borrowAmount) / 1e18) * (multiplier - FEE_PRECISION) / FEE_PRECISION;
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const liquidationProtocolFees = liquidationFees * LIQUIDATION_DISTRIBUTION_PART;
  const liquidationLiquidatorFees = liquidationFees * (1 - LIQUIDATION_DISTRIBUTION_PART);

  dailyFees.addCGToken(MIM, interestFees, METRIC.BORROW_INTEREST);
  dailyFees.addCGToken(MIM, borrowFees, BORROW_FEES);
  dailyFees.addCGToken(MIM, liquidationFees, METRIC.LIQUIDATION_FEES);

  // MIM is minted (CDP), not supplied by lenders, so all interest and opening fees,
  // plus the protocol's 10% liquidation cut, accrue to the protocol (accrueInfo.feesEarned)
  dailyRevenue.addCGToken(MIM, interestFees, METRIC.BORROW_INTEREST);
  dailyRevenue.addCGToken(MIM, borrowFees, BORROW_FEES);
  dailyRevenue.addCGToken(MIM, liquidationProtocolFees, METRIC.LIQUIDATION_FEES);

  // the other 90% of the liquidation penalty is kept by liquidators
  dailySupplySideRevenue.addCGToken(MIM, liquidationLiquidatorFees, METRIC.LIQUIDATION_FEES);

  // AIP #10 splits all protocol revenue 50/50: buybacks + mSPELL stakers vs treasury
  const dailyHoldersRevenue = dailyRevenue.clone(REVENUE_TO_HOLDERS);
  const dailyProtocolRevenue = dailyRevenue.clone(1 - REVENUE_TO_HOLDERS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Fees paid by MIM borrowers in Abracadabra Cauldrons: interest on outstanding debt, a one-time borrow/opening fee, and liquidation penalties. Tracked from on-chain cauldron events (LogAccrue, LogBorrow, LogLiquidation).",
  Revenue: "Protocol's share of Cauldron fees: all interest and borrow/opening fees (MIM is minted, there are no lenders) plus 10% of liquidation penalties.",
  ProtocolRevenue: "50% of protocol revenue directed to the treasury (AIP #10).",
  HoldersRevenue: "50% of protocol revenue used for SPELL buybacks and mSPELL staker rewards (AIP #10).",
  SupplySideRevenue: "90% of liquidation penalties kept by liquidators.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest accrued on outstanding MIM debt in Cauldrons.",
    [BORROW_FEES]: "One-time borrow/opening fees charged when users borrow MIM from Cauldrons.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation penalties paid by borrowers on liquidated positions (CauldronV3+ markets).",
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "Interest on MIM debt retained by the protocol.",
    [BORROW_FEES]: "Borrow/opening fees retained by the protocol.",
    [METRIC.LIQUIDATION_FEES]: "10% of liquidation penalties retained by the protocol.",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: "50% of interest revenue directed to the treasury.",
    [BORROW_FEES]: "50% of borrow/opening fee revenue directed to the treasury.",
    [METRIC.LIQUIDATION_FEES]: "50% of the protocol's liquidation cut directed to the treasury.",
  },
  HoldersRevenue: {
    [METRIC.BORROW_INTEREST]: "50% of interest revenue used for SPELL buybacks and mSPELL stakers.",
    [BORROW_FEES]: "50% of borrow/opening fee revenue used for SPELL buybacks and mSPELL stakers.",
    [METRIC.LIQUIDATION_FEES]: "50% of the protocol's liquidation cut used for SPELL buybacks and mSPELL stakers.",
  },
  SupplySideRevenue: {
    [METRIC.LIQUIDATION_FEES]: "90% of liquidation penalties kept by liquidators.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2021-09-01" },
    [CHAIN.OPTIMISM]: { start: "2022-10-28" },
    [CHAIN.FANTOM]: { start: "2021-09-01" },
    [CHAIN.KAVA]: { start: "2023-05-01" },
    [CHAIN.ARBITRUM]: { start: "2021-09-01" },
    [CHAIN.AVAX]: { start: "2021-09-01" },
  },
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
