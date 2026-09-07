/**
 * MerryForge volume adapter for DefiLlama dimension-adapters (dexs dashboard).
 *
 * Volume = two-sided quote notional (buy + sell):
 *   - Curve: TokensPurchased.quoteAmountIn + TokensSold.quoteOut on each launch curve
 *   - Official AMM: BoughtAmmExactIn.quoteSpent + SoldAmmExactIn.quoteGross on TradeRouter
 *
 * Volume (curve + official AMM). Excludes graduation, bonds, create fees.
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Deployed config (Robinhood mainnet 4663). Values from monorepo SoT:
// LaunchFactory creation block 24875635 (≈ 2026-08-01 UTC) via RH Blockscout contract creation.
const LAUNCH_FACTORY = "0x3b5e8FE8d61B00b35e021275c96F754424b1B9A8";
const TRADE_ROUTER = "0x0913FE5c3f28721EDD92413c2D29BB1034D75e70";
const ZERO = "0x0000000000000000000000000000000000000000";

const TOKENS_PURCHASED =
  "event TokensPurchased(address indexed buyer, address indexed recipient, address indexed token, uint256 quoteAmountIn, uint256 feeAmount, uint256 tokensOut, uint256 priceAfter, uint256 timestamp)";

const TOKENS_SOLD =
  "event TokensSold(address indexed seller, address indexed recipient, address indexed token, uint256 tokenAmountIn, uint256 feeAmount, uint256 quoteOut, uint256 priceAfter, uint256 timestamp)";

const BOUGHT_AMM =
  "event BoughtAmmExactIn(address indexed launchToken, address indexed buyer, address indexed recipient, address payAsset, address quoteToken, uint256 payAmount, uint256 quoteSpent, uint256 feeAmount, uint256 tokensOut)";

// Full on-chain signature (includes unwrapToNative)
const SOLD_AMM =
  "event SoldAmmExactIn(address indexed launchToken, address indexed seller, address indexed recipient, address quoteToken, uint256 tokenAmountIn, uint256 quoteGross, uint256 feeAmount, uint256 quoteOutNet, bool unwrapToNative)";

async function listCurves(api: FetchOptions["api"]): Promise<string[]> {
  const count = Number(
    await api.call({ target: LAUNCH_FACTORY, abi: "uint256:launchCount" }),
  );
  if (!count || count <= 0) return [];

  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const curves: string[] = await api.multiCall({
    target: LAUNCH_FACTORY,
    abi: "function launchCurve(uint256) view returns (address)",
    calls: ids,
  });
  return curves.filter((c) => c && c !== ZERO);
}


async function resolveQuoteTokens(
  api: FetchOptions["api"],
  launchTokens: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(launchTokens.map((t) => t.toLowerCase()))].filter(
    (t) => t && t !== ZERO.toLowerCase(),
  );
  if (!unique.length) return {};

  // Preserve original checksummed addresses for multiCall targets
  const byLower = new Map<string, string>();
  for (const t of launchTokens) {
    if (t && t !== ZERO) byLower.set(t.toLowerCase(), t);
  }
  const tokens = unique.map((l) => byLower.get(l)!);

  const quotes: string[] = await api.multiCall({
    target: LAUNCH_FACTORY,
    abi: "function tokenQuoteToken(address) view returns (address)",
    calls: tokens,
  });

  const map: Record<string, string> = {};
  tokens.forEach((token, i) => {
    const q = quotes[i];
    if (!q || q === ZERO) {
      throw new Error(
        `MerryForge volume: unresolved quote token for launch token ${token}`,
      );
    }
    map[token.toLowerCase()] = q;
  });
  return map;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const curves = await listCurves(options.api);

  const [buys, sells] = await Promise.all([
    options.getLogs({ targets: curves, eventAbi: TOKENS_PURCHASED }),
    options.getLogs({ targets: curves, eventAbi: TOKENS_SOLD }),
  ]);

  const launchTokens: string[] = [];
  for (const log of buys) launchTokens.push(log.token);
  for (const log of sells) launchTokens.push(log.token);

  const quoteByToken = await resolveQuoteTokens(options.api, launchTokens);

  for (const log of buys) {
    const tokenKey = String(log.token).toLowerCase();
    const quote = quoteByToken[tokenKey];
    if (!quote) {
      throw new Error(
        `MerryForge volume: missing quote for buy log token ${log.token}`,
      );
    }
    dailyVolume.add(quote, log.quoteAmountIn);
  }
  for (const log of sells) {
    const tokenKey = String(log.token).toLowerCase();
    const quote = quoteByToken[tokenKey];
    if (!quote) {
      throw new Error(
        `MerryForge volume: missing quote for sell log token ${log.token}`,
      );
    }
    dailyVolume.add(quote, log.quoteOut);
  }

  const [ammBuys, ammSells] = await Promise.all([
    options.getLogs({ target: TRADE_ROUTER, eventAbi: BOUGHT_AMM }),
    options.getLogs({ target: TRADE_ROUTER, eventAbi: SOLD_AMM }),
  ]);

  for (const log of ammBuys) {
    if (log.quoteToken && log.quoteSpent != null) {
      dailyVolume.add(log.quoteToken, log.quoteSpent);
    }
  }
  for (const log of ammSells) {
    if (log.quoteToken && log.quoteGross != null) {
      dailyVolume.add(log.quoteToken, log.quoteGross);
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // Factory deploy day (block 24875635); see addresses comment above.
  start: "2026-08-01",
  methodology: {
    Volume:
      "Two-sided quote notional: bonding-curve buys (TokensPurchased.quoteAmountIn) and sells (TokensSold.quoteOut) plus official graduated AMM volume via TradeRouter (BoughtAmmExactIn.quoteSpent, SoldAmmExactIn.quoteGross). Excludes graduation migration, create fees, and bond flows.",
  },
};

export default adapter;
