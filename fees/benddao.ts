import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// https://docs.benddao.xyz/portal
// https://github.com/BendDAO/bend-lending-protocol/blob/main/deployments/deployed-contracts-main.json
const LEND_POOL = "0x70b97a0da65c15dfb0ffa02aee6fa36e507c2762";
const SECONDS_PER_YEAR = 31536000;

const abis = {
  getReservesList: "function getReservesList() view returns (address[])",
  getReserveData: "function getReserveData(address asset) view returns (uint256, uint128, uint128, uint128, uint128, uint40, address, address, address, uint8, uint256)",
};

const events = {
  ReserveDataUpdated: "event ReserveDataUpdated(address indexed reserve, uint256 liquidityRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex)",
  Redeem: "event Redeem(address user, address indexed reserve, uint256 borrowAmount, uint256 fineAmount, address indexed nftAsset, uint256 nftTokenId, address indexed borrower, uint256 loanId)",
};

// Extract reserve factor from bit-packed configuration (Aave V2 style, bits 64-79)
const getReserveFactor = (configuration: bigint): number => {
  return Number((BigInt(configuration) >> 64n) & 0xFFFFn) / 10000;
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, api } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Get all reserves from LendPool on-chain
  const reserves: string[] = await api.call({ target: LEND_POOL, abi: abis.getReservesList });

  // Get reserve data (debt tokens + reserve factors)
  const reserveDataResults = await Promise.all(
    reserves.map(r => api.call({ target: LEND_POOL, abi: abis.getReserveData, params: [r] }))
  );
  const debtTokens = reserveDataResults.map((data: any) => data[7]);
  const reserveFactors = reserveDataResults.map((data: any) => getReserveFactor(data[0]));

  const [totalDebts, reserveUpdates, redeemLogs] = await Promise.all([
    Promise.all(debtTokens.map((dt: string) => api.call({ target: dt, abi: "erc20:totalSupply" }))),
    getLogs({ target: LEND_POOL, eventAbi: events.ReserveDataUpdated }),
    getLogs({ target: LEND_POOL, eventAbi: events.Redeem }),
  ]);

  // Group reserve updates by reserve address, take last update per reserve
  const lastRateByReserve: Record<string, bigint> = {};
  reserveUpdates.forEach((log: any) => {
    lastRateByReserve[log.reserve.toLowerCase()] = log.variableBorrowRate;
  });

  // Calculate daily interest per reserve
  reserves.forEach((reserve, i) => {
    const rate = lastRateByReserve[reserve.toLowerCase()];
    if (!rate) return;

    const annualRate = Number(rate) / 1e27;
    const reserveFactor = reserveFactors[i];
    const dailyInterest = BigInt(Math.floor(Number(totalDebts[i]) * annualRate * 86400 / SECONDS_PER_YEAR));

    dailyFees.add(reserve, dailyInterest);
    dailyRevenue.add(reserve, BigInt(Math.floor(Number(dailyInterest) * reserveFactor)));
    dailySupplySideRevenue.add(reserve, BigInt(Math.floor(Number(dailyInterest) * (1 - reserveFactor))));
  });

  // Liquidation fines from Redeem events
  redeemLogs.forEach((log: any) => {
    dailyFees.add(log.reserve, log.fineAmount);
    dailyRevenue.add(log.reserve, log.fineAmount);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2022-03-21" },
  },
  methodology: {
    Fees: "Interest paid by borrowers on NFT-collateralized loans + redemption fines.",
    Revenue: "Protocol's share of borrow interest based on each reserve's factor + redemption fines.",
    ProtocolRevenue: "Protocol's share of borrow interest based on each reserve's factor + redemption fines.",
    SupplySideRevenue: "Remaining borrow interest distributed to lenders.",
  },
};

export default adapter;
