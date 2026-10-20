// fees/unitas-usdu.ts
//
// Website: https://www.unitas.so | Docs: https://docs.unitas.so | X: https://x.com/UnitasLabs
//
// How it works
// - Unitas deploys USDu collateral into delta-neutral strategies. Net strategy yield is split
//   80% sUSDu holders / 10% Insurance Fund / 10% Treasury (Unitas docs, "Protocol Revenue" page)
// - The 80% is deposited into the sUSDu staking contract. Observable leg on-chain is measured
//   and the the other two legs are dervied from the documented split 
// - UP token holders have no claim on revenue (docs), so there is no HoldersRevenue

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

// BSC: StakedUSDuV2 (sUSDu) emits RewardsReceived when the REWARDER_ROLE calls transferInRewards
// Source: Unitas EVM contract docs
const BSC = {
  usdu: "0xeA953eA6634d55dAC6697C436B1e81A679Db5882",
  stakedUsdu: "0x385C279445581a186a4182a5503094eBb652EC71",
};
const REWARDS_RECEIVED_EVENT = "event RewardsReceived(uint256 indexed amount, uint256 newVestingUSDuAmount)";

// Solana: yield deposits are USDu transfers from the Reward Distributor into the vault's stake pool USDu account
// Source: Unitas Solana address list in the docs. The Reward Distributor wallet is also the mint/redeem executor,
// so the receiver filter below is what isolates yield deposits from mint/redeem flows
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
    SELECT SUM(raw_amount) AS total
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
  return total === null || total === undefined ? 0n : BigInt(Math.round(Number(total)));
};

const fetch = async (options: FetchOptions) => {
  const isBsc = options.chain === CHAIN.BSC;
  const usdu = isBsc ? BSC.usdu : SOLANA.usdu;
  const stakerYield = isBsc ? await getBscStakerYield(options) : await getSolanaStakerYield(options);

  // Observed: 80% share. Derived from the documented split: gross yield, treasury and insurance shares
  const grossYield = (stakerYield * BPS) / STAKERS_SHARE_BPS;
  const treasuryYield = (grossYield * TREASURY_SHARE_BPS) / BPS;
  const insuranceYield = grossYield - stakerYield - treasuryYield; //10% to insurance

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.add(usdu, grossYield.toString(), LABELS.YIELD);
  dailySupplySideRevenue.add(usdu, stakerYield.toString(), LABELS.TO_STAKERS);
  dailyRevenue.add(usdu, treasuryYield.toString(), LABELS.TO_TREASURY);
  dailyRevenue.add(usdu, insuranceYield.toString(), LABELS.TO_INSURANCE);

  // Protocol keeps both shares and UP holders get none, so ProtocolRevenue == Revenue (separate instance via clone)
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const methodology = {
  Fees: "Net yield earned by Unitas strategies on USDu collateral (trading fees, funding rates and other market-neutral returns), estimated from the yield paid to sUSDu holders and the documented 80% share.",
  Revenue: "The 20% of net strategy yield kept by the protocol: 10% to the treasury and 10% to the Insurance Fund.",
  ProtocolRevenue: "The 20% of net strategy yield kept by the protocol: 10% to the treasury and 10% to the Insurance Fund.",
  SupplySideRevenue: "The 80% of net strategy yield deposited into the sUSDu staking contract and paid to sUSDu holders. Excludes the XGLD product.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.YIELD]: "Net strategy yield, derived as the observed sUSDu staker yield divided by the documented 80% staker share.",
  },
  SupplySideRevenue: {
    [LABELS.TO_STAKERS]: "USDu rewards deposited into the sUSDu staking contract (RewardsReceived on BSC; Reward Distributor transfers into the stake pool on Solana).",
  },
  Revenue: {
    [LABELS.TO_TREASURY]: "10% of net strategy yield allocated to treasury and platform operations, derived from the documented split.",
    [LABELS.TO_INSURANCE]: "10% of net strategy yield allocated to the Insurance Fund, derived from the documented split.",
  },
  ProtocolRevenue: {
    [LABELS.TO_TREASURY]: "10% of net strategy yield allocated to treasury and platform operations, derived from the documented split.",
    [LABELS.TO_INSURANCE]: "10% of net strategy yield allocated to the Insurance Fund, derived from the documented split.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true, 
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: "2025-11-30" }, // first RewardsReceived / transferInRewards call on StakedUSDuV2
    [CHAIN.SOLANA]: { start: "2025-06-16" }, // first Reward Distributor -> stake pool USDu transfer 
  },
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
