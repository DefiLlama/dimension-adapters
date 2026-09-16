import { httpPost } from "../utils/fetchURL";
import coreAssets from "./coreAssets.json";

export const AFTERMATH_API = "https://aftermath.finance/api/perpetuals";

// Production deployment: addresses/environments/production/move-iperps.yml.
// Registry: 0xda0bd7a60182efd662b70e0de99218bbd2b6c4bbe9de23c0bb5a87ec52b37c37.
const PACKAGE_ID = "0x3ec740df8428aa9c93aaef7f8cc1542ac3194fd014826b51bfe245346d64efc7";

// First daily candle of the relaunched production markets; legacy markets are no longer served.
export const AFTERMATH_HISTORY_START = "2026-08-18";

interface AftermathMarket {
  objectId: string;
  packageId: string;
  collateralCoinType: string;
  marketState: { openInterest: number };
  indexPrice: number;
}

// API schemas: https://aftermath.finance/api/openapi/spec.json.
// Discover every market, including paused markets which can still have open positions/history.
export async function getAftermathMarkets(): Promise<AftermathMarket[]> {
  const response = await httpPost(`${AFTERMATH_API}/all-markets`, {
    collateralCoinType: coreAssets.sui.USDC_CIRCLE,
  });
  if (!Array.isArray(response?.markets) || !response.markets.length)
    throw new Error("Missing Aftermath production markets");

  const ids = new Set<string>();
  for (const market of response.markets) {
    if (!market || !/^0x[0-9a-f]{64}$/.test(market.objectId)
      || market.packageId !== PACKAGE_ID || market.collateralCoinType !== coreAssets.sui.USDC_CIRCLE)
      throw new Error("Invalid Aftermath production market");
    if (ids.has(market.objectId)) throw new Error(`Duplicate Aftermath market: ${market.objectId}`);
    ids.add(market.objectId);
  }
  return response.markets;
}
