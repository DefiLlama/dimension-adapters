import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

// https://bscscan.com/address/0xd1581d1E0dE260F64054e9a77b18489b7c9bfa41 (SettlementRouter proxy)
const ROUTER = "0xd1581d1E0dE260F64054e9a77b18489b7c9bfa41";
// https://bscscan.com/address/0xf91b7467974692E5dB27D1a99Ab7cd6dc6356438 (LuminaLPVault proxy)
const LLP = "0xf91b7467974692E5dB27D1a99Ab7cd6dc6356438";
// https://bscscan.com/address/0x452D0c5014DabD21844f4885Cd0d57020076217D (ProtocolFeeCollector proxy)
const COLLECTOR = "0x452D0c5014DabD21844f4885Cd0d57020076217D";
const USDT = ADDRESSES.bsc.USDT;

const eventAbis = {
  feeDeposited: "event FeeDeposited(bytes32 indexed settlementId, uint256 amount, uint256 timestamp)",
  feeReceived: "event FeeReceived(uint256 amount, uint256 newTotalAssets)",
  insurance: "event InsuranceContributionReceived(uint256 amount, uint256 insuranceFundAssets)",
  referral: "event ReferralRewardSettled(bytes32 indexed settlementId, address indexed referrer, address indexed trader, uint256 amount, bool isOpenSide)",
};

const TO_PROTOCOL = "Open/Close Fees To Protocol";
const TO_LPS = "Open/Close Fees To LPs";
const TO_REFERRERS = "Open/Close Fees To Referrers";
const TO_INSURANCE = "Liquidation Fees To LP Insurance Fund";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [protocolLogs, lpLogs, insuranceLogs, referralLogs] = await Promise.all([
    options.getLogs({ targets: [COLLECTOR], eventAbi: eventAbis.feeDeposited }),
    options.getLogs({ targets: [LLP], eventAbi: eventAbis.feeReceived }),
    options.getLogs({ targets: [LLP], eventAbi: eventAbis.insurance }),
    options.getLogs({ targets: [ROUTER], eventAbi: eventAbis.referral }),
  ]);

  for (const log of protocolLogs) {
    dailyFees.add(USDT, log.amount, METRIC.OPEN_CLOSE_FEES);
    dailyRevenue.add(USDT, log.amount, TO_PROTOCOL);
  }
  for (const log of lpLogs) {
    dailyFees.add(USDT, log.amount, METRIC.OPEN_CLOSE_FEES);
    dailySupplySideRevenue.add(USDT, log.amount, TO_LPS);
  }
  for (const log of referralLogs) {
    dailyFees.add(USDT, log.amount, METRIC.OPEN_CLOSE_FEES);
    dailySupplySideRevenue.add(USDT, log.amount, TO_REFERRERS);
  }
  for (const log of insuranceLogs) {
    dailyFees.add(USDT, log.amount, METRIC.LIQUIDATION_FEES);
    dailySupplySideRevenue.add(USDT, log.amount, TO_INSURANCE);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Open, close and liquidation fees paid by traders in USDT, after fee discounts, summed from the on-chain transfers made at settlement.",
  Revenue: "The protocol share of trading fees, deposited on-chain into the fee collector contract.",
  ProtocolRevenue: "The protocol share of trading fees, deposited on-chain into the fee collector contract and kept by the protocol treasury.",
  SupplySideRevenue: "The LP vault share of trading fees, the part of liquidation fees kept as the LP insurance fund, and referral rewards paid to referrers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.OPEN_CLOSE_FEES]: "Fees charged when a position is opened or closed (protocol share + LP share + referral reward). Also contains the protocol and LP shares of liquidation fees, which the on-chain events do not separate.",
    [METRIC.LIQUIDATION_FEES]: "The insurance part of liquidation fees (the only part of a liquidation fee that has its own on-chain event).",
  },
  Revenue: {
    [TO_PROTOCOL]: "Trading fees deposited into the ProtocolFeeCollector contract.",
  },
  ProtocolRevenue: {
    [TO_PROTOCOL]: "Trading fees deposited into the ProtocolFeeCollector contract.",
  },
  SupplySideRevenue: {
    [TO_LPS]: "Trading fees credited to the LP vault (raises the LP share price).",
    [TO_REFERRERS]: "Referral rewards paid on-chain to the trader's referrer at settlement.",
    [TO_INSURANCE]: "Part of each liquidation fee added to the insurance fund held inside the LP vault.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: "2026-05-21", // current SettlementRouter / ProtocolFeeCollector proxies went live
  methodology,
  breakdownMethodology,
};

export default adapter;
