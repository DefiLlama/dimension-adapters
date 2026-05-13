import https from "node:https"
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"

// Rainbow Wallet predictions fee wallet on Polygon (pre-Polymarket-v2)
const RainbowFeeWallet = '0x757758506d6a4F8a433F8BECaFd52545f9Cb050a';

// USDC.e on Polygon (used pre-Polymarket-v2)
const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';

// Native USDC on Polygon (used by Polymarket v2 builder fees)
const USDC_POLYGON = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';

// Rainbow's builder code in Polymarket v2
const RAINBOW_BUILDER_CODE = '0xabce5abdc189cba6fb85edb9170e3e6e41607e946b06d112b7f87e2f2977020c';

// 2026-04-29 00:00 UTC — Polymarket v2 cutover. Before: on-chain. On/after: API.
const POLYMARKET_V2_CUTOVER = 1777420800;

const POLYMARKET_HOST = 'clob.polymarket.com';

// clob.polymarket.com sits behind Cloudflare which intermittently resets
// connections from axios/undici's TLS fingerprint. Node's native https module
// uses a different fingerprint that gets through, with retries for residual flakiness.
function httpsGetJson(path: string, maxAttempts = 20): Promise<any> {
  return new Promise(async (resolve, reject) => {
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const body = await new Promise<string>((res, rej) => {
          const req = https.request({
            host: POLYMARKET_HOST,
            port: 443,
            path,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
          }, (response) => {
            if (response.statusCode !== 200) {
              rej(new Error(`HTTP ${response.statusCode}`));
              return;
            }
            let data = '';
            response.on('data', (c) => (data += c));
            response.on('end', () => res(data));
          });
          req.on('error', rej);
          req.setTimeout(15000, () => req.destroy(new Error('timeout')));
          req.end();
        });
        return resolve(JSON.parse(body));
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    reject(lastErr);
  });
}

// Sum Rainbow's builder fees (in USDC) from Polymarket's API for the given window.
// API returns `builderFee` as a human-readable USDC string (e.g. "4.83208").
async function fetchBuilderFeeUsdc(startTs: number, endTs: number): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      builder_code: RAINBOW_BUILDER_CODE,
      after: String(startTs),
      before: String(endTs),
    });
    if (cursor) qs.set('next_cursor', cursor);
    const data = await httpsGetJson(`/builder/trades?${qs.toString()}`);
    for (const t of data.data ?? []) {
      if (t.builderFee) total += Number(t.builderFee);
    }
    cursor = data.next_cursor;
  } while (cursor && cursor !== 'LTE=');
  return total;
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()

  // On-chain leg: capture USDC.e transfers to the Rainbow fee wallet
  // (only meaningful pre-Polymarket-v2; for windows fully after, this returns 0)
  if (options.startTimestamp < POLYMARKET_V2_CUTOVER) {
    const onChain = await addTokensReceived({
      options,
      targets: [RainbowFeeWallet],
      token: USDC_E,
    })
    dailyFees.add(onChain, 'Trading Fees')
  }

  // API leg: sum Rainbow's builder fees from Polymarket for our builder code
  if (options.endTimestamp >= POLYMARKET_V2_CUTOVER) {
    const apiStart = Math.max(options.startTimestamp, POLYMARKET_V2_CUTOVER);
    const apiEnd = options.endTimestamp;
    const builderFeeUsdc = await fetchBuilderFeeUsdc(apiStart, apiEnd);
    if (builderFeeUsdc > 0) {
      // API returns human USDC; convert to raw 1e6 base units for the Balances helper
      const raw = Math.round(builderFeeUsdc * 1e6);
      dailyFees.add(USDC_POLYGON, raw, 'Trading Fees');
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'Pre-Polymarket-v2: ~1% of shares value on each prediction market trade routed through the Rainbow fee wallet. Post-Polymarket-v2: Rainbow takes 1% of notional volume on taker trades and 0.5% of notional volume on maker trades, attributed via the Rainbow builder code',
    Revenue: 'All fees go to Rainbow (pre-v2: USDC.e to Rainbow fee wallet; post-v2: USDC attributed via builder code)',
    ProtocolRevenue: 'All fees go to Rainbow (pre-v2: USDC.e to Rainbow fee wallet; post-v2: USDC attributed via builder code)',
  },
  breakdownMethodology: {
    Fees: {
      'Trading Fees': 'Pre-v2: USDC.e charged on each prediction market open/close trade. Post-v2: 1% of notional on taker trades + 0.5% of notional on maker trades, attributed to Rainbow via Polymarket v2 builder code',
    },
    Revenue: {
      'Trading Fees': 'All trading fees flow to Rainbow (pre-v2 to the fee wallet, post-v2 via builder code attribution)',
    },
    ProtocolRevenue: {
      'Trading Fees': 'All trading fees flow to Rainbow (pre-v2 to the fee wallet, post-v2 via builder code attribution)',
    },
  },
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: '2025-12-01',
    }
  },
}

export default adapter
