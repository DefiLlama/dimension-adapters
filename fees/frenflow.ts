import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";

/**
 * FrenFlow — social copytrading + trading UI for prediction markets.
 * https://frenflow.com  ·  https://x.com/frenflow_
 *
 * Two on-chain revenue streams on Polygon, both summed into `dailyFees`:
 *
 *   1. Service Fees — a 1% fee pulled atomically (user → treasury) by
 *      FrenFlow's FeeCollector contract at Polymarket trade settlement.
 *      Tracked via the `FeeCollected` event. Denominated in USDC.e.
 *
 *   2. Builder Fees — Polymarket pays builders a per-fill commission for
 *      trades carrying their `builderCode`. PM accrues these in an
 *      internal treasury and periodically distributes them on-chain to
 *      each builder's profile wallet (typically batched through a
 *      "disperse"-style contract). FrenFlow's builder profile wallet is
 *      `0x58715321c2c6a216d1259f368c34f987a4a26b64`. We sum incoming
 *      pUSD / USDC.e / USDC (native) Transfer events to that wallet.
 *
 * Volume (notional) for FrenFlow as a Polymarket builder is tracked
 * separately in `factory/polymarket.ts`.
 *
 * Income-statement mapping (per GUIDELINES):
 *   dailyFees            — gross protocol revenue (Service + Builder)
 *   dailyUserFees        — portion paid directly by end-users (100%:
 *                          service fee is pulled from the trader's
 *                          wallet at fill; builder fee is funded by
 *                          Polymarket out of the trader's order amount)
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

const SERVICE_FEE_LABEL = "Service Fees";
const BUILDER_FEE_LABEL = "Builder Fees";

const transferEventAbi =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
const transferTopic = ethers.id("Transfer(address,address,uint256)");
const padAddress = (address: string) => ethers.zeroPadValue(address, 32);

const fetch: FetchV2 = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances();

  // Filter `Transfer(from, to, value)` by the indexed `to` topic only —
  // any sender that lands tokens in BUILDER_PAYOUT counts. The middle
  // `null` keeps `from` unconstrained.
  const builderPayoutTopics = [transferTopic, null, padAddress(BUILDER_PAYOUT)];
  const builderTokens = [PUSD_POLYGON, USDC_E_POLYGON, USDC_NATIVE_POLYGON];

  const [feeCollectedLogs, ...builderInflowsByToken] = await Promise.all([
    getLogs({
      target: FEE_COLLECTOR,
      eventAbi:
        "event FeeCollected(bytes32 indexed fillId, address indexed user, bytes32 indexed tokenId, uint8 service, uint256 tradeAmount, uint256 feeAmount, uint256 feeBps, uint256 timestamp)",
    }),
    ...builderTokens.map((token) =>
      getLogs({
        target: token,
        eventAbi: transferEventAbi,
        topics: builderPayoutTopics as any,
      })
    ),
  ]);

  for (const log of feeCollectedLogs) {
    dailyFees.add(USDC_E_POLYGON, log.feeAmount, SERVICE_FEE_LABEL);
  }
  builderInflowsByToken.forEach((inflows, i) => {
    const token = builderTokens[i];
    for (const log of inflows) {
      dailyFees.add(token, log.value, BUILDER_FEE_LABEL);
    }
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.POLYGON],
  fetch,
  start: "2026-04-20",
  pullHourly: true,
  methodology: {
    Fees:
      "Two streams: (1) 1% service fee pulled atomically by FrenFlow's FeeCollector contract at trade settlement, and (2) Polymarket builder-fee distributions to FrenFlow's builder profile wallet (paid in pUSD or USDC.e on a Polymarket-defined cadence).",
    UserFees:
      "100% of fees originate from end-user trades. Service fees are transferFrom'd from the trader at fill; builder fees come out of the trader's order amount via Polymarket and are forwarded to FrenFlow.",
    Revenue:
      "All fees flow to FrenFlow treasury / builder wallet. No liquidity providers.",
    ProtocolRevenue:
      "Same as Revenue — 100% of collected fees are retained by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [SERVICE_FEE_LABEL]:
        "Per-trade 1% service fee on Polymarket trades routed through FrenFlow. Denominated in USDC.e. Tracked from the `FeeCollected` event on the FeeCollector contract `0x95e47CBC5c4D9434412AF44Ade02B33613EDb787`.",
      [BUILDER_FEE_LABEL]:
        "Polymarket builder-fee distributions to FrenFlow's builder profile wallet `0x58715321c2c6a216d1259f368c34f987a4a26b64`. Tracked as incoming `Transfer` events of pUSD, USDC.e, or USDC (native) to that wallet — all settlement currencies Polymarket has used or could use for builder payouts.",
    },
    UserFees: {
      [SERVICE_FEE_LABEL]: "Same as Fees — paid directly from the trader's wallet.",
      [BUILDER_FEE_LABEL]:
        "Same as Fees — funded out of the trader's notional via Polymarket.",
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
  },
};

export default adapter;
