import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// https://docs.benddao.xyz/portal
// https://github.com/BendDAO/bend-lending-protocol/tree/main/contracts
// https://github.com/BendDAO/bend-lending-protocol/blob/main/deployments/deployed-contracts-main.json
const LEND_POOL = "0x70b97a0da65c15dfb0ffa02aee6fa36e507c2762";
const DATA_PROVIDER = "0x3811DA50f55CCF75376C5535562F5b4797822480";
const SECONDS_PER_YEAR = 31536000;

const abis = {
  getReservesList: "function getReservesList() view returns (address[])",
  getReserveConfigurationData: "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 reserveFactor, bool borrowingEnabled, bool isActive, bool isFrozen)",
  getReserveData: "function getReserveData(address asset) view returns (uint256 availableLiquidity, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)",
};

const events = {
  ReserveDataUpdated: "event ReserveDataUpdated(address indexed reserve, uint256 liquidityRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex)",
  Redeem: "event Redeem(address user, address indexed reserve, uint256 borrowAmount, uint256 fineAmount, address indexed nftAsset, uint256 nftTokenId, address indexed borrower, uint256 loanId)",
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, api, startTimestamp, endTimestamp } = options;
  const period = endTimestamp - startTimestamp;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Get all reserves from LendPool
  const reserves: string[] = await api.call({ target: LEND_POOL, abi: abis.getReservesList });

  // Get reserve config and data from DataProvider
  const calls = reserves.map(r => ({ params: [r] }));
  const [configResults, dataResults, reserveUpdates, redeemLogs] = await Promise.all([
    api.multiCall({ target: DATA_PROVIDER, abi: abis.getReserveConfigurationData, calls }),
    api.multiCall({ target: DATA_PROVIDER, abi: abis.getReserveData, calls }),
    getLogs({ target: LEND_POOL, eventAbi: events.ReserveDataUpdated }),
    getLogs({ target: LEND_POOL, eventAbi: events.Redeem }),
  ]);

  const lastRateByReserve: Record<string, bigint> = {};
  reserveUpdates.forEach((log: any) => {
    lastRateByReserve[log.reserve.toLowerCase()] = log.variableBorrowRate;
  });

  // Calculate daily interest per reserve
  reserves.forEach((reserve, i) => {
    if (!configResults[i].isActive || configResults[i].isFrozen) return;

    const totalDebt = BigInt(dataResults[i].totalVariableDebt);
    if (totalDebt === 0n) return;

    const rate = lastRateByReserve[reserve.toLowerCase()] ?? BigInt(dataResults[i].variableBorrowRate);
    const reserveFactor = Number(configResults[i].reserveFactor) / 10000;

    const annualRate = Number(rate) / 1e27;
    const dailyInterest = BigInt(Math.floor(Number(totalDebt) * annualRate * period / SECONDS_PER_YEAR));

    const protocolShare = BigInt(Math.floor(Number(dailyInterest) * reserveFactor));
    dailyFees.add(reserve, dailyInterest, METRIC.BORROW_INTEREST);
    dailyRevenue.add(reserve, protocolShare, "Borrow Interest To veBEND Holders");
    dailyHoldersRevenue.add(reserve, protocolShare, "Borrow Interest To veBEND Holders");
    dailySupplySideRevenue.add(reserve, BigInt(Math.floor(Number(dailyInterest) * (1 - reserveFactor))), "Borrow Interest To Lenders");
  });

  // Redemption fines from Redeem events (fines go to first bidder, not protocol)
  redeemLogs.forEach((log: any) => {
    dailyFees.add(log.reserve, log.fineAmount, METRIC.LIQUIDATION_FEES);
    dailySupplySideRevenue.add(log.reserve, log.fineAmount, METRIC.LIQUIDATION_FEES);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Interest paid by borrowers on NFT-collateralized loans + redemption fines (max(5% debt, 0.2 ETH)) paid to auction bidders.",
  Revenue: "Protocol's share of borrow interest, 100% claimable by veBEND holders proportionally, distributed weekly as BWETH.",
  HoldersRevenue: "Protocol's share of borrow interest, 100% distributed to veBEND holders proportionally.",
  SupplySideRevenue: "Remaining 70% of borrow interest distributed to depositors via bToken interest-bearing mechanism.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest accrued daily on outstanding NFT-collateralized loans.",
    [METRIC.LIQUIDATION_FEES]: "Redemption fines from Redeem events, paid by borrowers who repay during auction (fine = max(5% of debt, 0.2 ETH)), goes to first bidder.",
  },
  Revenue: {
    "Borrow Interest To veBEND Holders": "The protocol's share of borrow interest, minted as bTokens to BendCollector and distributed weekly to veBEND holders.",
  },
  HoldersRevenue: {
    "Borrow Interest To veBEND Holders": "The protocol's share of borrow interest, minted as bTokens to BendCollector and distributed weekly to veBEND holders.",
  },
  SupplySideRevenue: {
    "Borrow Interest To Lenders": "The portion of borrow interest distributed to liquidity providers.",
    [METRIC.LIQUIDATION_FEES]: "Redemption fines from Redeem events paid to the first bidder (not the protocol).",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2022-05-20" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
