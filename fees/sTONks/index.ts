import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";
import { METRIC } from "../../helpers/metrics";

/**
 * sTONks — Launchpad, Trading Bot & Terminal on TON
 *
 * Fee sources:
 *   - Trading Bot (@stonks_sniper_bot):   1% per swap     → https://t.me/stonks_sniper_bot
 *   - Terminal (stonkslabs.com):          1% per swap     → https://stonkslabs.com/
 *   - sTONks.pump Launchpad (stonkslabs.com): variable fee → https://stonkslabs.com/
 *
 * All fees are collected in the main fee wallet.
 * Launchpad fees arrive exclusively from a dedicated launchpad fee router.
 *
 * Daily volume (Bot + Terminal only) is reverse-calculated: volume = fee_inflow / 0.01
 * Launchpad volume is NOT reverse-calculated due to variable fee rate.
 *
 * Main fee wallet (user-friendly): EQDve6CLVbaaXQTd54gI-XK8iR63SsaSgcoRZ9byuSFdakFl
 * Main fee wallet (raw):           0:ef7ba08b55b69a5d04dde78808f972bc891eb74ac69281ca1167d6f2b9215d6a
 *
 * Launchpad fee router (raw):      0:fccfdaaeb90c7bb38c01c11df67d48492fe0888548936d50290753c0084c1815
 *
 * Website:  https://stonks.dog/
 * App:      https://stonkslabs.com/
 */

const FEE_WALLET = "0:ef7ba08b55b69a5d04dde78808f972bc891eb74ac69281ca1167d6f2b9215d6a";
const LAUNCHPAD_ROUTER = "0:fccfdaaeb90c7bb38c01c11df67d48492fe0888548936d50290753c0084c1815";

const toBigInt = (v: any): bigint => {
  if (v === null || v === undefined) return 0n;
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return 0n;
};

/**
 * Fetches all incoming transactions to FEE_WALLET within [start, end).
 * Returns:
 *   - tradingFees:   inflow NOT from launchpad router (Bot + Terminal) → 1% fee, volume calculable
 *   - launchpadFees: inflow FROM launchpad router → variable fee, no volume
 */
const fetchFeeInflows = async (
  start: number,
  end: number
): Promise<{ tradingFees: bigint; launchpadFees: bigint }> => {
  let tradingFees = 0n;
  let launchpadFees = 0n;

  let before_lt: string | undefined;
  let before_hash: string | undefined;
  let offset = 0;
  const seen = new Set<string>();

  while (true) {
    const url =
      `https://toncenter.com/api/v3/transactions?account=${FEE_WALLET}&start_utime=${start}&end_utime=${end}&limit=1000&offset=${offset}&sort=desc` +
      (before_lt && before_hash ? `&before_lt=${before_lt}&before_hash=${before_hash}` : "");

    let data: any;
    try {
      data = await fetchURL(url);
    } catch (e) {
      throw new Error(`Failed to fetch transactions for sTONks fee wallet: ${e}`);
    }

    const txs: any[] = data.transactions;
    if (!txs || !txs.length) break;

    let reachedBeforeStart = false;

    for (const tx of txs) {
      const key = tx.hash ?? `${tx.lt}:${tx.utime}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Only count successful incoming transfers
      if (!tx?.description?.action?.success) continue;

      const inMsg = tx.in_msg;
      if (!inMsg || inMsg.destination?.toLowerCase() !== FEE_WALLET.toLowerCase()) continue;

      const value = toBigInt(inMsg.value);
      if (value === 0n) continue;

      const senderAddress: string | undefined = inMsg.source;

      if (senderAddress?.toLowerCase() === LAUNCHPAD_ROUTER.toLowerCase()) {
        launchpadFees += value;
      } else {
        tradingFees += value;
      }
    }

    if (reachedBeforeStart || txs.length < 1000) break;

    const lastTx = txs[txs.length - 1];
    if (lastTx?.lt == null || lastTx?.hash == null) break;

    before_lt = String(lastTx.lt);
    before_hash = String(lastTx.hash);
    offset += 1000;

    await sleep(1000);
  }

  return { tradingFees, launchpadFees };
};

const fetch = async (options: FetchOptions) => {
  const { startTimestamp: start, endTimestamp: end } = options;

  const { tradingFees, launchpadFees } = await fetchFeeInflows(start, end);

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(tradingFees, METRIC.TRADING_FEES);
  dailyFees.addGasToken(launchpadFees, 'Launchpad Fees');

  // Volume only from Bot + Terminal (1% fee); launchpad excluded (variable fee)
  const dailyVolume = options.createBalances();
  dailyVolume.addGasToken((tradingFees * 100n));

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume:
    "Trading volume reverse-calculated from the 1% platform fee collected from @stonks_sniper_bot (Telegram trading bot) " +
    "and the sTONks Terminal (stonkslabs.com). sTONks.pump Launchpad volume is excluded as fees are variable and depend on individual token tokenomics.",
  Fees:
    "All TON inflows to the main fee wallet: 1% fees from @stonks_sniper_bot and the sTONks Terminal, " +
    "plus variable fees from sTONks.pump Launchpad — all accessible at stonkslabs.com. Launchpad fees are routed via a dedicated fee router.",
  Revenue: "All TON inflows to the main fee wallet: 1% fees from @stonks_sniper_bot and the sTONks Terminal, " +
    "plus variable fees from sTONks.pump Launchpad — all accessible at stonkslabs.com. Launchpad fees are routed via a dedicated fee router.",
  ProtocolRevenue: "All TON inflows to the main fee wallet: 1% fees from @stonks_sniper_bot and the sTONks Terminal, " +
    "plus variable fees from sTONks.pump Launchpad — all accessible at stonkslabs.com. Launchpad fees are routed via a dedicated fee router.",
};

const breakdown = {
  [METRIC.TRADING_FEES]: '1% fee from @stonks_sniper_bot and the sTONks Terminal',
  'Launchpad Fees': 'Variable fees from sTONks.pump Launchpad',
}

const breakdownMethodology = {
  Fees: breakdown,
  Revenue: breakdown,
  ProtocolRevenue: breakdown,
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // gets rate limited during refill, should be enabled post refill
  fetch,
  chains: [CHAIN.TON],
  start: "2024-01-12",
  methodology,
  breakdownMethodology,
};

export default adapter;
