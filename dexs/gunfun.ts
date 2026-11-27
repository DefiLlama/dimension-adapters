import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import ADDRESSES from "../helpers/coreAssets.json";

// Raydium LaunchLab SOL platform fee vault of the gun.fun platform config AmuQaqj2qvUnShNTLdTzkJgsDpBt9LFUWAYLVPsdgBHb.
const PLATFORM_FEE_VAULT = "DoX6NFeLnSgeQsCYKAtUVCPtXZo6xBsyJFCBaXW3crQK";

// feeRate of the platform config (10000 / 1e6): the vault receives 1% of every bonding curve trade.
const PLATFORM_FEE_RATE = 0.01;

const LABEL = "Launchpad Fees";

const fetch = async (options: FetchOptions) => {
  const [row] = await queryAllium(`
    SELECT
      (SELECT COALESCE(SUM(raw_amount), 0) FROM solana.assets.transfers
        WHERE token_acc_to = '${PLATFORM_FEE_VAULT}'
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})) AS platform_fee,
      -- rows past the window end mean Allium has loaded the whole window
      EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
  `);
  if (!row?.indexed) throw new Error(`gunfun: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);

  const platformFee = Number(row.platform_fee);
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  dailyVolume.add(ADDRESSES.solana.SOL, platformFee / PLATFORM_FEE_RATE);
  dailyFees.add(ADDRESSES.solana.SOL, platformFee, LABEL);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Volume: "Buys and sells of GunFun tokens on their Raydium LaunchLab bonding curves, in SOL. Excludes presales and trading after a token graduates to a Raydium pool.",
  Fees: "The 1% platform fee paid by traders on every buy and sell of a GunFun token on its Raydium LaunchLab bonding curve. Excludes the 0.5% token creator fee and the Raydium fee charged on the same trades, and presales.",
  Revenue: "The 1% platform fee on bonding curve buys and sells of GunFun tokens, all collected by GunFun.",
  ProtocolRevenue: "The 1% platform fee on bonding curve buys and sells of GunFun tokens, claimed by the GunFun team wallet.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL]: "1% platform fee on bonding curve buys and sells of GunFun tokens, paid in SOL.",
  },
  Revenue: {
    [LABEL]: "1% platform fee on bonding curve buys and sells of GunFun tokens, all collected by GunFun.",
  },
  ProtocolRevenue: {
    [LABEL]: "1% platform fee on bonding curve buys and sells of GunFun tokens, claimed by the GunFun team wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-07",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  doublecounted: true, // LaunchLab reports the same bonding curve trades.
  methodology,
  breakdownMethodology,
};

export default adapter;
