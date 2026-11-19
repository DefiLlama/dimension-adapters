import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { buildStablecoinAdapter } from "../../helpers/attestations-stablecoins";
import { httpPost } from "../../utils/fetchURL";

// WLFI buyback (announced 2026-11-06): on 2026-11-10 WLFI said buybacks execute on Aster from this public wallet
// (a Safe on BNB Chain; bought WLFI is withdrawn to it, e.g. 21.05M WLFI in tx 0x1a0da86c73cd1ab2e37f435abb3a830a6b3677ac4496626a0a5aed7f3fb0e401).
// Buys are counted at fill time on Aster, not on withdrawal, so each WLFI is counted once.
const BUYBACK_WALLET = '0x0f5d119dC9b3AF846155Ee9b6F4fe184b231BB17';
const ASTER_RPC_URL = 'https://tapi.asterdex.com/info';
const MAX_FILLS = 1000; // aster_spotUserFills returns the newest 1000 fills of the window at most

type AsterFill = { symbol: string; side: 'BUY' | 'SELL'; price: string; qty: string; time: number };

async function readFills(fromMs: number, toMs: number): Promise<AsterFill[]> {
  const res = await httpPost(ASTER_RPC_URL, {
    id: 1,
    jsonrpc: '2.0',
    method: 'aster_spotUserFills',
    params: [BUYBACK_WALLET, null, fromMs, toMs - 1, 'latest'],
  });
  if (!res?.result) throw new Error(`aster_spotUserFills failed for ${fromMs}-${toMs}: ${JSON.stringify(res?.error ?? res).slice(0, 200)}`);
  return res.result.fills ?? []; // the key is absent when the window has no fills
}

async function getSpotFills(fromMs: number, toMs: number): Promise<AsterFill[]> {
  const fills = await readFills(fromMs, toMs);
  if (fills.length >= MAX_FILLS) {
    if (toMs - fromMs <= 1000) throw new Error('aster_spotUserFills: more than 1000 fills in one second');
    const mid = Math.floor((fromMs + toMs) / 2);
    return [...(await getSpotFills(fromMs, mid)), ...(await getSpotFills(mid, toMs))];
  }
  // the endpoint has returned short pages under load, so a page is only accepted when a second read agrees
  const again = await readFills(fromMs, toMs);
  if (JSON.stringify(again) !== JSON.stringify(fills)) throw new Error(`aster_spotUserFills: two reads of ${fromMs}-${toMs} disagree (${fills.length} vs ${again.length} fills)`);
  return fills;
}

// The buyback is paid by WLFI itself, so it is moved from ProtocolRevenue to HoldersRevenue on this chain:
// Revenue = ProtocolRevenue + HoldersRevenue holds per chain and the total ProtocolRevenue is yield minus buybacks.
async function fetchBuybacks(options: FetchOptions) {
  const dailyHoldersRevenue = options.createBalances();
  const fills = await getSpotFills(options.startTimestamp * 1000, options.endTimestamp * 1000);
  for (const f of fills) {
    // WLFIUSD1 is quoted in USD1, valued at $1
    if (f.symbol === 'WLFIUSD1' && f.side === 'BUY') dailyHoldersRevenue.addUSDValue(Number(f.qty) * Number(f.price), METRIC.TOKEN_BUY_BACK);
  }
  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.subtract(dailyHoldersRevenue, METRIC.ASSETS_YIELDS);
  return { dailyFees: 0, dailyRevenue: 0, dailyProtocolRevenue, dailyHoldersRevenue };
}

// { time, circulation (in billions), allocated (in billions), tbillRate? (in %) }
const adapter = buildStablecoinAdapter(CHAIN.OFF_CHAIN, '262', 30,
  // https://worldlibertyfinancial.com/usd1/attestation-reports
  [
    {
      time: '2026-04',
      circulation: 4.5,
      allocated: 3.8,
    },
    {
      time: '2026-03',
      circulation: 4.4,
      allocated: 3.4,
    },
    {
      time: '2026-02',
      circulation: 4.7,
      allocated: 4.0,
    },
    {
      time: '2026-01',
      circulation: 5.0,
      allocated: 4.5,
    },
    {
      time: '2025-12',
      circulation: 3.3,
      allocated: 2.8,
    },
    {
      time: '2025-11',
      circulation: 2.7,
      allocated: 2.3,
    },
    {
      time: '2025-10',
      circulation: 2.6,
      allocated: 2.3,
    },
    {
      time: '2025-09',
      circulation: 2.6,
      allocated: 2.3,
    },
    {
      time: '2025-08',
      circulation: 2.6,
      allocated: 2.2,
    },
    {
      time: '2025-07',
      circulation: 2.2,
      allocated: 1.9,
    },
    {
      time: '2025-06',
      circulation: 2.2,
      allocated: 1.9,
    },
    {
      time: '2025-05',
      circulation: 2.2,
      allocated: 1.9,
    },
    {
      time: '2025-04',
      circulation: 2.1,
      allocated: 2.1,
    },

  ]);

adapter.methodology = {
  Fees: 'All yields from USD1 backing assets investments (Fidelity money market funds).',
  Revenue: 'All yields from USD1 backing assets investments (Fidelity money market funds) collected by World Liberty Financial.',
  ProtocolRevenue: 'All yields from USD1 backing assets investments (Fidelity money market funds) collected by World Liberty Financial, minus the USD1 World Liberty Financial spends on WLFI buybacks.',
  HoldersRevenue: 'WLFI bought back on Aster by the public WLFI buyback wallet since November 2026, counted at fill time.',
}

adapter.breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'All yields from USD1 backing assets investments (Fidelity money market funds).',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'All yields from USD1 backing assets investments (Fidelity money market funds) collected by World Liberty Financial.',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: 'All yields from USD1 backing assets investments (Fidelity money market funds) collected by World Liberty Financial, minus the USD1 spent on WLFI buybacks (negative on the aster chain).',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'USD1 spent on WLFIUSD1 buy fills on Aster by the WLFI buyback wallet 0x0f5d119dC9b3AF846155Ee9b6F4fe184b231BB17.',
  },
}

adapter.adapter![CHAIN.ASTER] = { fetch: fetchBuybacks, start: '2026-11-05' };
adapter.allowNegativeValue = true; // the aster chain carries only the buyback, booked as negative ProtocolRevenue

adapter.start = '2025-04-28';

export default adapter
