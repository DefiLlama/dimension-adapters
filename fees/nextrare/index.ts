// NextRare — TCG gacha protocol on MegaETH.
//
// Income statement:
//   dailyFees              = gift cards burned on pack opens × $5     (gross spend)
//   dailySupplySideRevenue = USDm paid back to users via SellbackVault (refund cost)
//   dailyRevenue           = dailyFees − dailySupplySideRevenue       (net to treasury)
//   dailyProtocolRevenue   = dailyRevenue                              (no holders/LP split)
//
// A user buys gift cards (each = $5), opens packs by burning them, and may
// sell unwanted draws back to the SellbackVault for USDm. The protocol earns
// nothing on a card that is bought and then sold back, so net revenue is the
// difference between gross spend and refunds.
//
// All flows live on MegaETH. The Collector contract on Base/Arbitrum/BSC/
// Mantle/HyperEVM/Monad is a cross-chain on-ramp into a MegaETH gift-card
// mint; deposits there are fully refundable via sellback after settlement,
// so they are not measured as fees here.
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
import { METRIC } from "../../helpers/metrics";

const GIFT_CARD = "0x7D7d2c07196feFBD334B127136bCA1BD8EafFBF1";

// SellbackVault has been redeployed once. Both vaults paid out real
// USDm to users while live, so historical sellback is the *union* of
// payouts via every pool ever authorized on either vault.
const VAULTS: { addr: string; deployBlock: number }[] = [
    { addr: "0x6D6A11ED1fA9aEc8c1fAb2d6168Fb33276d634EA", deployBlock: 12572896 },
    { addr: "0xa51eAFEfcCeeBF6970500761F49B9bcBd9F1E68e", deployBlock: 13394884 },
];

const GIFT_CARD_TOKEN_ID = 1;
const PRICE_PER_CARD_USD = 5;
const ZERO = "0x0000000000000000000000000000000000000000";

const TRANSFER_SINGLE =
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)";
const POOL_UPDATED =
    "event PoolUpdated(address indexed pool, bool authorized)";
const SETTLED =
    "event Settled(uint64 indexed drawId, bool kept, uint256 value)";

const LABEL_PACK_OPEN = "Pack Open";
const LABEL_SELLBACK = "Sellback Refund";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances(); // gross
    const dailySupplySideRevenue = options.createBalances(); // refund cost
    const dailyRevenue = options.createBalances(); // net = fees − supply-side

    // 1) Pack opens — gift cards burned today, valued at $5 each.
    const burnLogs = await options.getLogs({
        target: GIFT_CARD,
        eventAbi: TRANSFER_SINGLE,
    });
    for (const log of burnLogs) {
        if (String(log.to).toLowerCase() !== ZERO) continue;
        if (Number(log.id) !== GIFT_CARD_TOKEN_ID) continue;
        const usd = Number(log.value) * PRICE_PER_CARD_USD;
        dailyFees.addUSDValue(usd, LABEL_PACK_OPEN);
    }

    // 2) Enumerate every GachaPool ever authorized on either vault.
    //    A pool that's been deauthorized still emitted real Settled events
    //    while it was live, so we want the union of "ever authorized=true"
    //    across both vaults — not just currently-active pools. Cheap
    //    (<20 events total ever) and forward-compatible with the
    //    deploy-new-pool flow.
    const everAuthorized = new Set<string>();
    const poolEvents = await options.getLogs({
        targets: [...VAULTS.map(v => v.addr)],
        eventAbi: POOL_UPDATED,
        fromBlock: Math.min(...VAULTS.map(v => v.deployBlock)),
        cacheInCloud: true,
    });
    for (const ev of poolEvents) {
        if (ev.authorized) everAuthorized.add(String(ev.pool).toLowerCase());
    }

    // 3) Sellback refunds — Settled(kept=false, value) from every pool that
    //    was ever authorized. `value` is USDm wei (18 decimals); USDm trades
    //    1:1 with USD. Booked positive on supply-side, negative on revenue.
    if(everAuthorized.size > 0) {
    const settled = await options.getLogs({ targets: [...everAuthorized], eventAbi: SETTLED });
    for (const log of settled) {
            if (log.kept) continue; // kept=true means NFT mint; `value` is a tokenId, not money.
            const usd = Number(log.value) / 1e18;
            dailySupplySideRevenue.addUSDValue(usd, LABEL_SELLBACK);
        }
    }

    const revenue = dailyFees.clone();
    revenue.subtract(dailySupplySideRevenue);

    const revenueInUsd = await revenue.getUSDValue();
    dailyRevenue.addUSDValue(revenueInUsd, METRIC.PROTOCOL_FEES);

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const methodology = {
    Fees: "Gross protocol fees on MegaETH: gift cards burned on pack opens (× $5 each).",
    SupplySideRevenue: "USDm paid back to users via SellbackVault when they choose to sell back rather than keep an NFT — i.e. refunds.",
    Revenue: "Net protocol revenue = Fees − SupplySideRevenue. The amount the NextRare treasury actually retains after refunds.",
    ProtocolRevenue: "Same as Revenue — 100% accrues to the treasury (no LP, no holders, no split).",
};

const breakdownMethodology = {
    Fees: {
        [LABEL_PACK_OPEN]: "Gift cards burned by GachaPool.draw() (each card = $5). Detected via ERC-1155 TransferSingle to address(0) on the GiftCard contract, id=1.",
    },
    SupplySideRevenue: {
        [LABEL_SELLBACK]: "USDm paid out by SellbackVault (current and prior) when a user opts not to keep an NFT. Detected via Settled(kept=false, value) on every GachaPool ever authorized on either vault.",
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "The amount the NextRare treasury actually retains after refunds.",
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "The amount the NextRare treasury actually retains after refunds.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    allowNegativeValue: true,
    fetch,
    chains: [CHAIN.MEGAETH],
    start: "2026-04-06",
    methodology,
    breakdownMethodology,
};

export default adapter;
