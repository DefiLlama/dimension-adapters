// Website: https://www.unitas.so | Docs: https://docs.unitas.so | X: https://x.com/UnitasLabs
//
// How it works
// - Unitas deploys USDu collateral into delta-neutral strategies. Net strategy yield is split
//   80% sUSDu holders / 10% Insurance Fund / 10% Treasury
//   Source: https://docs.unitas.so/overview/up ("Protocol Revenue") and https://docs.unitas.so/solution-design/minting-usdu
// - The 80% is deposited into the sUSDu staking contract. That leg is measured on-chain;
//   the other two legs are derived from the documented split
// - The Insurance Fund absorbs strategy losses and negative funding for USDu holders, so its share is
//   supply side (same treatment as fees/mainstreet), not revenue
// - UP token holders have no claim on revenue (docs), so there is no HoldersRevenue. Checked on-chain (Oct 2026): UP burns
//   to 0x0 are cross-chain bridge burns, and the only DEX buy by a Unitas wallet (0x01444f55..., 2026-05-22) went into
//   PancakeSwap UP/WBNB liquidity, not a buyback

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

// Documented split of net strategy yield, in basis points
const BPS = 10_000n;
const STAKERS_SHARE_BPS = 8_000n; // 80% to sUSDu holders (deposited into the staking contract)
const TREASURY_SHARE_BPS = 1_000n; // 10% to treasury / platform operations

const LABELS = {
  YIELD: "Net Strategy Yield",
  TO_STAKERS: "Yield To sUSDu Stakers",
  TO_TREASURY: "Yield To Treasury",
  TO_INSURANCE: "Yield To Insurance Fund",
};

// BSC: StakedUSDuV2 (sUSDu) emits RewardsReceived when the rewarder (0x4f8a485e3c6d9da9254c192b3214cab7908ee2c5) calls transferInRewards
// Addresses: https://docs.unitas.so/overview/unitas-overview
// Sample TX: bscscan.com/tx/0xffaee7ad372782be10690c8acc49e93faa308446a33949d4a3e3a77fc8e5d49a
const BSC = {
  usdu: "0xeA953eA6634d55dAC6697C436B1e81A679Db5882",
  stakedUsdu: "0x385C279445581a186a4182a5503094eBb652EC71",
};
const REWARDS_RECEIVED_EVENT = "event RewardsReceived(uint256 indexed amount, uint256 newVestingUSDuAmount)";

// Solana: yield deposits are USDu transfers from the Reward Distributor into the vault's stake pool USDu account
// Addresses: https://docs.unitas.so/mainnet-program-and-address-index. The Reward Distributor wallet is also the
// mint/redeem executor, so the receiver filter below is what isolates yield deposits from mint/redeem flows
// Sample TX: solscan.io/tx/2xSFyKfersvAGZE7wGESvSThuBiiZMctqqHm7icfcNAC94MrQrWg3s9BBEVpvScj7CiBYFfMhgZhSnD5zq1NnXkx
const SOLANA = {
  usdu: "9ckR7pPPvyPadACDTzLwK2ZAEeUJ3qGSnzPs8bVaHrSy",
  rewardDistributor: "USDUY49DCh6wAHvx5jZn1xHSyDc8fvMa7YBnFi1aYEy",
  stakePoolUsduAccount: "CFgrWjb9DYKVqf7QyQfmwjboDDkXpFHQ6292rnYxrjsa",
};

// Raw USDu (smallest units) paid into the sUSDu staking contract in the window
const getBscStakerYield = async (options: FetchOptions): Promise<bigint> => {
  const logs = await options.getLogs({
    target: BSC.stakedUsdu,
    eventAbi: REWARDS_RECEIVED_EVENT,
  });
  return logs.reduce((sum: bigint, log: any) => sum + BigInt(log.amount.toString()), 0n);
};

const getSolanaStakerYield = async (options: FetchOptions): Promise<bigint> => {
  const query = `
    SELECT TO_VARCHAR(SUM(TO_DECIMAL(raw_amount_str, 38, 0))) AS total
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint = '${SOLANA.usdu}'
      AND from_address = '${SOLANA.rewardDistributor}'
      AND token_acc_to = '${SOLANA.stakePoolUsduAccount}'
  `;
  const rows = await queryAllium(query);
  if (!rows || rows.length === 0) throw new Error("Unitas: Allium returned no row for Solana reward transfers");
  // NULL sum = no reward deposit in this window (deposits are periodic, not continuous)
  const total = rows[0].total;
  return total === null || total === undefined ? 0n : BigInt(total);
};

const fetch = async (options: FetchOptions) => {
  const isBsc = options.chain === CHAIN.BSC;
  const usdu = isBsc ? BSC.usdu : SOLANA.usdu;
  const stakerYield = isBsc ? await getBscStakerYield(options) : await getSolanaStakerYield(options);

  // Observed: 80% share. Derived from the documented split: gross yield, treasury and insurance shares
  const grossYield = (stakerYield * BPS) / STAKERS_SHARE_BPS;
  const treasuryYield = (grossYield * TREASURY_SHARE_BPS) / BPS;
  const insuranceYield = grossYield - stakerYield - treasuryYield; // remaining 10% to the Insurance Fund

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.add(usdu, grossYield.toString(), LABELS.YIELD);
  dailySupplySideRevenue.add(usdu, stakerYield.toString(), LABELS.TO_STAKERS);
  dailySupplySideRevenue.add(usdu, insuranceYield.toString(), LABELS.TO_INSURANCE);
  dailyRevenue.add(usdu, treasuryYield.toString(), LABELS.TO_TREASURY);

  // The treasury share is all the protocol keeps and UP holders get none, so ProtocolRevenue == Revenue (separate instance via clone)
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const methodology = {
  Fees: "Net yield earned by Unitas strategies on USDu collateral (trading fees, funding rates and other market-neutral returns), estimated from the yield paid to sUSDu holders and the documented 80% share. Excludes the XGLD product.",
  Revenue: "The 10% of net strategy yield allocated to the Unitas treasury and platform operations.",
  ProtocolRevenue: "The 10% of net strategy yield allocated to the Unitas treasury and platform operations.",
  SupplySideRevenue: "The 80% of net strategy yield paid to sUSDu holders and the 10% set aside in the Insurance Fund that backs USDu holders.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.YIELD]: "Net strategy yield, derived as the observed sUSDu staker yield divided by the documented 80% staker share.",
  },
  SupplySideRevenue: {
    [LABELS.TO_STAKERS]: "USDu rewards deposited into the sUSDu staking contract (RewardsReceived on BSC; Reward Distributor transfers into the stake pool on Solana).",
    [LABELS.TO_INSURANCE]: "10% of net strategy yield allocated to the Insurance Fund, which covers strategy losses and negative funding, derived from the documented split.",
  },
  Revenue: {
    [LABELS.TO_TREASURY]: "10% of net strategy yield allocated to treasury and platform operations, derived from the documented split.",
  },
  ProtocolRevenue: {
    [LABELS.TO_TREASURY]: "10% of net strategy yield allocated to treasury and platform operations, derived from the documented split.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: "2025-11-30" }, // first RewardsReceived / transferInRewards call on StakedUSDuV2
    [CHAIN.SOLANA]: { start: "2025-07-28" },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
