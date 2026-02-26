import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryEvents } from "../../helpers/sui";
import { METRIC } from "../../helpers/metrics";

// Marketplace package
const MARKETPLACE_PACKAGE = "0xdad0749c40a7adfbdd1b9e46d2f24d6cfec2dfc3a5ead61c69cb7fec30cd02d1";

// On-chain config (from mainnet Marketplace object)
const GGSUI_SHARE_PCT = 15; // 15% of commission → ggSUI staking rewards

// Safe wrapper: queryEvents crashes on empty results (data[data.length-1].timestampMs is undefined)
async function safeQueryEvents(params: any): Promise<any[]> {
  try {
    return await queryEvents(params);
  } catch (e: any) {
    if (e?.message?.includes("Cannot read properties of undefined") || e instanceof TypeError) {
      return [];
    }
    throw e;
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // ── Direct NFT purchases ──
  //
  // BuyEvent fields:
  //   price      – listing price (what seller receives)
  //   commission – marketplace fee = price * 2% (in MIST)
  //   royalty    – creator royalty (goes directly to collection creator via TransferPolicy)
  //
  // Total buyer pays: price + commission + royalty
  // Commission destination: marketplace.available_sui
  //   → distribute_accumulated_fee(): 15% to ggSUI vault, 85% to withdrawable_sui
  //   → claim_withdrawable_sui(): 85% to FeeCollector<SUI>
  //   → FeeCollector split: 50% treasury (team), 50% HONEY buyback

  const buyEvents = await safeQueryEvents({
    eventType: `${MARKETPLACE_PACKAGE}::marketplace::BuyEvent`,
    options,
  });

  for (const e of buyEvents) {
    const commission = Number(e.commission);
    const royalty = Number(e.royalty);
    // Total fees = platform commission + creator royalties
    dailyFees.addGasToken(commission + royalty, METRIC.TRADING_FEES);
    // Protocol revenue = full commission (protocol controls distribution)
    dailyRevenue.addGasToken(commission, METRIC.PROTOCOL_FEES);
    // Supply side = 15% of commission goes to ggSUI stakers
    dailySupplySideRevenue.addGasToken(Math.floor(commission * GGSUI_SHARE_PCT / 100), METRIC.STAKING_REWARDS);
  }

  // ── Bid acceptances ──
  //
  // BidAcceptedEvent fields:
  //   price      – bid price
  //   commission – marketplace fee (2%)
  //   NOTE: no royalty field in this event, but royalty IS charged (stored in ActiveBid at creation)

  const bidAcceptedEvents = await safeQueryEvents({
    eventType: `${MARKETPLACE_PACKAGE}::marketplace::BidAcceptedEvent`,
    options,
  });

  for (const e of bidAcceptedEvents) {
    const commission = Number(e.commission);
    dailyFees.addGasToken(commission, METRIC.TRADING_FEES);
    dailyRevenue.addGasToken(commission, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addGasToken(Math.floor(commission * GGSUI_SHARE_PCT / 100), METRIC.STAKING_REWARDS);
  }

  // ── Floor sweep purchases (buyback mechanism) ──
  //
  // BuyViaSweepFloorEvent: commission charged from buyer, not protocol funds

  const sweepEvents = await safeQueryEvents({
    eventType: `${MARKETPLACE_PACKAGE}::marketplace::BuyViaSweepFloorEvent`,
    options,
  });

  for (const e of sweepEvents) {
    const commission = Number(e.commission);
    dailyFees.addGasToken(commission, METRIC.TRADING_FEES);
    dailyRevenue.addGasToken(commission, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addGasToken(Math.floor(commission * GGSUI_SHARE_PCT / 100), METRIC.STAKING_REWARDS);
  }

  // ── Listed sweep purchases ──

  const listedSweepEvents = await safeQueryEvents({
    eventType: `${MARKETPLACE_PACKAGE}::marketplace::BuyListedViaSweepFloorEvent`,
    options,
  });

  for (const e of listedSweepEvents) {
    const commission = Number(e.commission);
    dailyFees.addGasToken(commission, METRIC.TRADING_FEES);
    dailyRevenue.addGasToken(commission, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addGasToken(Math.floor(commission * GGSUI_SHARE_PCT / 100), METRIC.STAKING_REWARDS);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total marketplace fees: 2% platform commission on all NFT sales plus creator royalties (royalties go directly to creators).",
  Revenue: "Full 2% platform commission on all NFT trades.",
  ProtocolRevenue: "Full platform commission. Distributed internally as: 15% to ggSUI staking vault, 42.5% to team treasury (withdrawable), 42.5% to HONEY buybacks.",
  SupplySideRevenue: "15% of marketplace commission redistributed to ggSUI stakers via vault addon_staking_rewards.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-01-01",
    },
  },
  methodology,
};

export default adapter;
