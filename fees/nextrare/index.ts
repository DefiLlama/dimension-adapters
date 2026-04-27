// NextRare — cross-chain NFT gacha protocol on MegaETH.
//
// Net protocol fees:
//   dailyFees = (gift cards burned on pack opens × $5) − (USDm sellback payouts)
//
// A user buys gift cards (each = $5), opens packs by burning them, and may
// sell unwanted draws back to the SellbackVault for USDm. The protocol earns
// nothing on a card that is bought and then sold back, so gross deposits
// overstate true earnings — this adapter measures the *net*.
//
// All flows live on MegaETH. The Collector contract on Base/Arbitrum/BSC/
// Mantle/HyperEVM/Monad is a cross-chain on-ramp into a MegaETH gift-card
// mint; it is intentionally not measured here, since deposits there can be
// fully refunded via sellback after settlement.
//
// Sources of truth:
//   Burns    — GiftCard ERC-1155 TransferSingle to address(0), id=1.
//              BURNER_ROLE is granted only to GachaPool, which only burns on
//              draws paid in gift cards, so this filter equals "spending".
//   Sellback — GachaPool.Settled(drawId, kept=false, value) where `value` is
//              the USDm wei amount paid out. SellbackVault has been redeployed
//              once, so we enumerate the union of every pool ever authorized
//              on either vault by replaying their PoolUpdated logs since
//              deploy. Pools that are now deauthorized still emitted real
//              Settled events while live and must be counted.

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GIFT_CARD = "0x7D7d2c07196feFBD334B127136bCA1BD8EafFBF1";

// SellbackVault has been redeployed once. Both vaults paid out real
// USDm to users while live, so historical sellback is the *union* of
// payouts via every pool ever authorized on either vault.
const VAULTS: { addr: string; deployBlock: number }[] = [
  { addr: "0x6D6A11ED1fA9aEc8c1fAb2d6168Fb33276d634EA", deployBlock: 0xbfd660 }, // 12_572_896
  { addr: "0xa51eAFEfcCeeBF6970500761F49B9bcBd9F1E68e", deployBlock: 0xcc63c4 }, // 13_394_884
];

const GIFT_CARD_TOKEN_ID  = 1;
const PRICE_PER_CARD_USD  = 5;
const ZERO                = "0x0000000000000000000000000000000000000000";

const TRANSFER_SINGLE =
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)";
const POOL_UPDATED =
  "event PoolUpdated(address indexed pool, bool authorized)";
const SETTLED =
  "event Settled(uint64 indexed drawId, bool kept, uint256 value)";

const LABEL_PACK_OPEN = "Pack Open";
const LABEL_SELLBACK  = "Sellback Refund";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // 1) Pack opens — gift cards burned today, valued at $5 each.
  const burnLogs = await options.getLogs({
    target: GIFT_CARD,
    eventAbi: TRANSFER_SINGLE,
  });
  for (const log of burnLogs) {
    if (String(log.to).toLowerCase() !== ZERO) continue;
    if (Number(log.id) !== GIFT_CARD_TOKEN_ID) continue;
    const cards = Number(log.value);
    dailyFees.addUSDValue(cards * PRICE_PER_CARD_USD, LABEL_PACK_OPEN);
  }

  // 2) Enumerate every GachaPool ever authorized on either vault.
  //    A pool that's been deauthorized still emitted real Settled events
  //    while it was live, so we want the union of "ever authorized=true"
  //    across both vaults — not just currently-active pools. Cheap
  //    (<20 events total ever) and forward-compatible with the
  //    deploy-new-pool flow.
  const everAuthorized = new Set<string>();
  for (const v of VAULTS) {
    const poolEvents = await options.getLogs({
      target: v.addr,
      eventAbi: POOL_UPDATED,
      fromBlock: v.deployBlock,
      cacheInCloud: true,
    });
    for (const ev of poolEvents) {
      if (ev.authorized) everAuthorized.add(String(ev.pool).toLowerCase());
    }
  }

  // 3) Sellback refunds — Settled(kept=false, value) from every pool that
  //    was ever authorized. `value` is USDm wei (18 decimals). USDm trades
  //    1:1 with USD, so we record it directly as a negative USD amount.
  for (const pool of everAuthorized) {
    const settled = await options.getLogs({ target: pool, eventAbi: SETTLED });
    for (const log of settled) {
      if (log.kept) continue; // kept=true means NFT mint; `value` is a tokenId, not money.
      const usd = Number(log.value) / 1e18;
      dailyFees.addUSDValue(-usd, LABEL_SELLBACK);
    }
  }

  return {
    dailyFees,
    dailyRevenue:         dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Net protocol fees on MegaETH: gift cards burned on pack opens (× $5 each) minus USDm paid back to users via SellbackVault. The protocol earns nothing on a card that is bought and then sold back, so gross deposits would overstate true earnings.",
  Revenue:         "Same as Fees — 100% accrues to the NextRare treasury (no LP, no holders, no split).",
  ProtocolRevenue: "Same as Fees — the NextRare treasury captures the net.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL_PACK_OPEN]: "Gift cards burned by GachaPool.draw() (each card = $5). Detected via ERC-1155 TransferSingle to address(0) on the GiftCard contract, id=1.",
    [LABEL_SELLBACK]:  "USDm paid out by SellbackVault (current and prior) when a user opts not to keep an NFT. Detected via Settled(kept=false, value) on every GachaPool ever authorized on either vault. Recorded as a negative.",
  },
  Revenue: {
    [LABEL_PACK_OPEN]: "Pack-open spending accrues to the NextRare treasury.",
    [LABEL_SELLBACK]:  "Sellback payouts are funded from the treasury via SellbackVault — recorded as a negative.",
  },
  ProtocolRevenue: {
    [LABEL_PACK_OPEN]: "Pack-open spending accrues to the NextRare treasury.",
    [LABEL_SELLBACK]:  "Sellback payouts are funded from the treasury via SellbackVault — recorded as a negative.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: { fetch, start: "2026-03-23" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
