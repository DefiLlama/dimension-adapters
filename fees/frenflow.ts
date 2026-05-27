import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

/**
 * FrenFlow — social copytrading + trading UI for prediction markets.
 * https://frenflow.com  ·  https://x.com/frenflow_
 *
 * Two on-chain revenue streams on Polygon:
 *
 *   1. Service Fees — a 1% fee pulled atomically (user → treasury) by
 *      FrenFlow's FeeCollector contract at Polymarket trade settlement.
 *      Tracked via the `FeeCollected` event. Denominated in USDC.e.
 *      Counted as both `dailyFees` and `dailyUserFees` because the
 *      fee is debited from the trader's wallet at fill time.
 *
 *   2. Builder Fees — Polymarket pays builders a per-fill commission for
 *      trades carrying their `builderCode`. PM accrues these in an
 *      internal treasury and periodically distributes them on-chain to
 *      each builder's profile wallet (typically batched through a
 *      "disperse"-style contract). FrenFlow's builder profile wallet is
 *      `0x58715321c2c6a216d1259f368c34f987a4a26b64`. Counted in
 *      `dailyFees` / `dailyRevenue` but NOT `dailyUserFees`, because PM
 *      pays them on a settlement cadence (not user-atomic) and the
 *      distribution day rarely matches the trade day.
 *
 * Volume (notional) for FrenFlow as a Polymarket builder is tracked
 * separately in `factory/polymarket.ts`.
 *
 * Income-statement mapping (per GUIDELINES):
 *   dailyFees            — gross protocol revenue (Service + Builder)
 *   dailyUserFees        — Service Fees only (atomic, user-paid)
 *   dailyRevenue         — gross profit (no supply-side to reimburse)
 *   dailyProtocolRevenue — portion allocated to treasury (100%)
 */

// Production FeeCollector on Polygon — live since 2026-04-20 (first V2
// prod trade, tx 0xcd88b05b…). Contract: contracts/src/FeeCollector.sol
const FEE_COLLECTOR = "0x95e47CBC5c4D9434412AF44Ade02B33613EDb787";

// FrenFlow builder profile wallet on Polymarket. Polymarket distributes
// builder-fee accruals to this address (denominated in pUSD or USDC.e).
const BUILDER_PAYOUT = "0x58715321c2c6a216d1259f368c34f987a4a26b64";

// USDC.e (bridged) on Polygon — settlement currency for FeeCollector
// and one of the tokens Polymarket uses for builder payouts.
const USDC_E_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

// pUSD on Polygon — Polymarket's V2 collateral (1:1 USDC.e wrapper).
// First builder payout (tx 0x4e0e7e42…, block 86195685, 2026-04-30)
// was denominated in pUSD, so it is the primary builder-fee token.
const PUSD_POLYGON = "0xc011a7E12a19f7B1f670d46F03B03f3342E82DFB";

// USDC native (Circle) on Polygon — Polymarket has not used it for
// builder payouts yet, but watching it covers the case where they
// switch settlement currency without notice.
const USDC_NATIVE_POLYGON = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

// Sanctioned senders for Polymarket builder-fee distributions. We only
// credit Builder Fees from `Transfer` events whose `from` address is in
// this allowlist, so unrelated transfers (top-ups, refunds, mistaken
// sends) into BUILDER_PAYOUT are not misclassified as protocol revenue.
//
// Known senders so far:
//  - 0xd7a0535c… : EOA used for the first PM builder distribution
//                  (tx 0x4e0e7e42, block 86195685, 2026-04-30) which
//                  paid 27 builders via a disperse contract
//                  (0xd152f549…). The Transfer events show the EOA in
//                  the indexed `from` slot, not the disperse contract.
//
// If Polymarket rotates its hot wallet, add the new EOA here.
const KNOWN_PM_BUILDER_PAYOUT_SENDERS = new Set(
  ["0xd7a0535cd4349145ac47693803988d59c015d4ba"].map((a) => a.toLowerCase())
);

const SERVICE_FEE_LABEL = "Service Fees";
const BUILDER_FEE_LABEL = "Builder Fees";

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();

  // Filter Transfer events by indexed `from` topic so the Llama Indexer
  // can serve the query directly (single-topic post-event-signature
  // filters are the well-supported case). We then check `log.to` in JS
  // to ensure the destination is BUILDER_PAYOUT — that's the secondary
  // gate that prevents counting any unrelated transfer between the
  // sanctioned sender and a third party.
  const builderTokens = [PUSD_POLYGON, USDC_E_POLYGON, USDC_NATIVE_POLYGON];
  
  const feeCollectedLogs = await getLogs({
    target: FEE_COLLECTOR,
    eventAbi:
      "event FeeCollected(bytes32 indexed fillId, address indexed user, bytes32 indexed tokenId, uint8 service, uint256 tradeAmount, uint256 feeAmount, uint256 feeBps, uint256 timestamp)",
  });

  const knownSenders = Array.from(KNOWN_PM_BUILDER_PAYOUT_SENDERS);

  const builderFees = await addTokensReceived({
    options,
    tokens: builderTokens,
    fromAdddesses: knownSenders,
    target: BUILDER_PAYOUT
  })

  dailyFees.add(builderFees, BUILDER_FEE_LABEL);
  dailyRevenue.add(builderFees, BUILDER_FEE_LABEL);

  for (const log of feeCollectedLogs) {
    dailyFees.add(USDC_E_POLYGON, log.feeAmount, SERVICE_FEE_LABEL);
    dailyUserFees.add(USDC_E_POLYGON, log.feeAmount, SERVICE_FEE_LABEL);
    dailyRevenue.add(USDC_E_POLYGON, log.feeAmount, SERVICE_FEE_LABEL);
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Two streams: (1) 1% service fee pulled atomically by FrenFlow's FeeCollector contract at trade settlement, and (2) Polymarket builder-fee distributions to FrenFlow's builder profile wallet, restricted to a sanctioned sender allowlist (paid in pUSD or USDC.e on a Polymarket-defined cadence).",
  UserFees: "Service fees only — these are transferFrom'd from the trader's wallet atomically at fill time. Builder fees are excluded because Polymarket pays them on its own settlement cadence, not at the user trade.",
  Revenue: "Service fees plus Polymarket builder distributions. All flow to FrenFlow treasury / builder wallet. No liquidity providers.",
  ProtocolRevenue: "Same as Revenue — 100% of collected fees are retained by the protocol.",
}

const breakdownMethodology = {
  Fees: {
    [SERVICE_FEE_LABEL]:
      "Per-trade 1% service fee on Polymarket trades routed through FrenFlow. Denominated in USDC.e. Tracked from the `FeeCollected` event on the FeeCollector contract `0x95e47CBC5c4D9434412AF44Ade02B33613EDb787`.",
    [BUILDER_FEE_LABEL]:
      "Polymarket builder-fee distributions to FrenFlow's builder profile wallet `0x58715321c2c6a216d1259f368c34f987a4a26b64`. Tracked as incoming `Transfer` events of pUSD, USDC.e, or USDC (native), restricted to a sanctioned sender allowlist of known Polymarket payout EOAs to avoid counting unrelated inflows as fees.",
  },
  UserFees: {
    [SERVICE_FEE_LABEL]: "Paid directly from the trader's wallet at fill.",
  },
  Revenue: {
    [SERVICE_FEE_LABEL]:
      "100% of collected service fees flow to the FrenFlow treasury at `0xb9e912e55454Ce284C38ccFED5b7fbbF327E689b`.",
    [BUILDER_FEE_LABEL]:
      "100% of builder distributions are retained by FrenFlow.",
  },
  ProtocolRevenue: {
    [SERVICE_FEE_LABEL]: "Same as Revenue — fully retained by the protocol.",
    [BUILDER_FEE_LABEL]: "Same as Revenue — fully retained by the protocol.",
  },
}
const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.POLYGON],
  fetch,
  start: "2026-04-20",
  pullHourly: true,
  breakdownMethodology,
  methodology,
};

export default adapter;
