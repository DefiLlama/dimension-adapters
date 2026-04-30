import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const LEND_POOL = "0x70b97a0da65c15dfb0ffa02aee6fa36e507c2762";
const DEBT_TOKEN = "0x87dDE3A3f4b629E389ce5894c9A1F34A7eeC5648";
const PROTOCOL_FEE_RATE = 0.3;
const SECONDS_PER_YEAR = 31536000;

const events = {
  ReserveDataUpdated: "event ReserveDataUpdated(address indexed reserve, uint256 liquidityRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex)",
  Redeem: "event Redeem(address user, address indexed reserve, uint256 borrowAmount, uint256 fineAmount, address indexed nftAsset, uint256 nftTokenId, address indexed borrower, uint256 loanId)",
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, api } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const [totalDebt, reserveUpdates, redeemLogs] = await Promise.all([
    api.call({ target: DEBT_TOKEN, abi: "erc20:totalSupply" }),
    getLogs({ target: LEND_POOL, eventAbi: events.ReserveDataUpdated }),
    getLogs({ target: LEND_POOL, eventAbi: events.Redeem }),
  ]);

  // Calculate daily interest from borrow rate (RAY = 1e27)
  if (reserveUpdates.length > 0) {
    const lastUpdate = reserveUpdates[reserveUpdates.length - 1];
    const annualRate = Number(lastUpdate.variableBorrowRate) / 1e27;
    const dailyInterest = BigInt(Math.floor(Number(totalDebt) * annualRate * 86400 / SECONDS_PER_YEAR));

    dailyFees.add(ADDRESSES.ethereum.WETH, dailyInterest);
    dailyRevenue.add(ADDRESSES.ethereum.WETH, BigInt(Math.floor(Number(dailyInterest) * PROTOCOL_FEE_RATE)));
    dailySupplySideRevenue.add(ADDRESSES.ethereum.WETH, BigInt(Math.floor(Number(dailyInterest) * (1 - PROTOCOL_FEE_RATE))));
  }

  // Liquidation fines from Redeem events
  redeemLogs.forEach((log: any) => {
    dailyFees.add(ADDRESSES.ethereum.WETH, log.fineAmount);
    dailyRevenue.add(ADDRESSES.ethereum.WETH, log.fineAmount);
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
    Revenue: "30% of borrow interest collected by the protocol treasury + redemption fines.",
    ProtocolRevenue: "30% of borrow interest collected by the protocol treasury + redemption fines.",
    SupplySideRevenue: "70% of borrow interest distributed to ETH lenders.",
  },
};

export default adapter;
