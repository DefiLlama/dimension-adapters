import type { Balances } from '@defillama/sdk';
import { httpGet } from '../utils/fetchURL';

// Daily aggregates for Wallet V's Futures Builder, sourced from Aster userTrades and userCommissions.
const DAILY_API = 'https://api.walletv.io/defillama/aster/daily';
const BUILDER = '0x68c68ba58f50bdbe5c4a6faf0186b140eab2b764';
export const WALLET_V_ASTER_START = '2026-08-26';

interface WalletVAsterDay {
  date: string;
  builderAddress: string;
  commissionTradeCount: number;
  visibleTradeCount: number;
  volumeComplete: boolean;
  builderFeesByAsset: unknown;
  visibleVolumeByQuoteAsset: unknown;
}

export async function fetchWalletVAsterDay(date: string): Promise<WalletVAsterDay> {
  const response: { code?: number; data?: WalletVAsterDay } = await httpGet(DAILY_API, {
    params: { date },
    timeout: 15_000,
  });
  const day = response?.data;
  if (response?.code !== 0 || day?.date !== date ||
      typeof day.builderAddress !== 'string' || day.builderAddress.toLowerCase() !== BUILDER) {
    throw new Error(`Wallet V Aster: invalid daily response for ${date}`);
  }
  return day;
}

export function addWalletVAsterAmounts(balances: Balances, amounts: unknown, date: string, label?: string) {
  if (!amounts || typeof amounts !== 'object' || Array.isArray(amounts)) {
    throw new Error(`Wallet V Aster: missing asset amounts for ${date}`);
  }

  for (const [asset, amount] of Object.entries(amounts)) {
    const value = typeof amount === 'string' && /^\d+(?:\.\d+)?$/.test(amount) ? Number(amount) : NaN;
    if (!Number.isFinite(value)) {
      throw new Error(`Wallet V Aster: invalid decimal amount for ${date}`);
    }
    if (value === 0) continue;

    // All verified history is quoted and paid in USDT. Keep the original token units for USD pricing.
    if (asset !== 'USDT') {
      throw new Error(`Wallet V Aster: unsupported nonzero asset for ${date}`);
    }
    balances.addCGToken('tether', value, label);
  }
}
