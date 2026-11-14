import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

// DARKPOOL's public stats (no key). daily[] has one entry per UTC day, amounts in lamports:
//   fees: the fee wallet's 80% share of private-swap fees, counted when the keeper collects it (the program pays
//         the builder's 20% at swap time, so it is not in this number); the pool's own buyback swaps are excluded
//   sol:  SOL spent on $DARKPOOL buybacks (funded by private-swap fees and by $DARKPOOL's pump.fun creator fees)
const STATS = "https://api.darkpool.ag/v1/stats";

// Program constants (github.com/darkpoolsol/darkpool-program, programs/darkpool/src/lib.rs):
// SWAP_FEE_BPS = 50 (0.5% of each private swap), BUILDER_SHARE_BPS = 2000 (20% of the fee; a referrer, when there
// is one, gets REFERRAL_SHARE_BPS = 1000 of the fee out of the builder's share). The other 80% buys back $DARKPOOL.
const FEE_WALLET_SHARE = 0.8;
const BUILDER_SHARE = 0.2;

const fetch = async (options: FetchOptions) => {
  const stats = await fetchURL(STATS);
  const day = (stats.daily ?? []).find((d: any) => d.day === options.dateString);
  const feeWallet = Number(day?.fees ?? 0) / 1e9;
  const buybacks = Number(day?.sol ?? 0) / 1e9;
  const fees = feeWallet / FEE_WALLET_SHARE;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  dailyFees.addCGToken("solana", fees, METRIC.SWAP_FEES);
  dailyRevenue.addCGToken("solana", fees, METRIC.SWAP_FEES);
  dailyProtocolRevenue.addCGToken("solana", fees * BUILDER_SHARE, METRIC.SWAP_FEES);
  dailyHoldersRevenue.addCGToken("solana", buybacks, METRIC.TOKEN_BUY_BACK);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  // the API only returns daily aggregates
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-03",
  methodology: {
    Fees: "0.5% fee on every private swap (shielded balance swapped through Jupiter), in SOL value.",
    UserFees: "Users pay the 0.5% private-swap fee.",
    Revenue: "All private-swap fees go to the protocol: 80% to $DARKPOOL buybacks and 20% to the builder.",
    ProtocolRevenue: "The builder's 20% of private-swap fees (part of it goes to a referrer when there is one).",
    HoldersRevenue: "SOL spent buying back $DARKPOOL: half of the bought tokens are burned, half are distributed to private (shielded) holders. Buybacks are funded by the fee wallet's 80% of private-swap fees and by $DARKPOOL's pump.fun creator fees.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.SWAP_FEES]: "0.5% fee on every private swap." },
    Revenue: { [METRIC.SWAP_FEES]: "All private-swap fees." },
    ProtocolRevenue: { [METRIC.SWAP_FEES]: "The builder's 20% of private-swap fees." },
    HoldersRevenue: { [METRIC.TOKEN_BUY_BACK]: "SOL spent buying back $DARKPOOL (from private-swap fees and pump.fun creator fees); half burned, half distributed to shielded holders." },
  },
};

export default adapter;
