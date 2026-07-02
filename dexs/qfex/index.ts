import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const BASE_URL = "https://api.qfex.com";

interface TakerVolumePoint {
  takerBuyNotional: number;
  takerSellNotional: number;
}

interface OIPoint {
  openInterest: number | null;
}

async function fetch(options: FetchOptions) {
  const fromISO = new Date(options.startTimestamp * 1000).toISOString();
  const toISO = new Date(options.endTimestamp * 1000).toISOString();

  const refdataRes = await fetchURL(`${BASE_URL}/refdata`);
  const symbols: string[] = (refdataRes.data ?? [])
    .filter((s: any) => s.status === "ACTIVE")
    .map((s: any) => s.symbol);

  let dailyVolumeUSD = 0;
  let openInterestAtEndUSD = 0;

  // allow catching of errors because symbols active today might not have data for the previous day
  for (const symbol of symbols) {
    const encoded = encodeURIComponent(symbol);
    const [volRes, oiRes] = await Promise.all([
      fetchURL(`${BASE_URL}/taker-volume/${encoded}?intervalMinutes=1440&fromISO=${fromISO}&toISO=${toISO}`)
        .then((r) => (r.data ?? []) as TakerVolumePoint[])
        .catch(() => [] as TakerVolumePoint[]),
      fetchURL(`${BASE_URL}/open-interest/${encoded}?intervalMinutes=1440&fromISO=${fromISO}&toISO=${toISO}`)
        .then((r) => (r.data ?? []) as OIPoint[])
        .catch(() => [] as OIPoint[]),
    ]);

    for (const p of volRes) {
      dailyVolumeUSD += (p.takerBuyNotional ?? 0) + (p.takerSellNotional ?? 0);
    }

    if (oiRes.length > 0) {
      const last = oiRes[oiRes.length - 1];
      if (last.openInterest != null) openInterestAtEndUSD += last.openInterest;
    }

    await sleep(500);
  }

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(dailyVolumeUSD);

  const openInterestAtEnd = options.createBalances();
  openInterestAtEnd.addUSDValue(openInterestAtEndUSD);

  return {
    dailyVolume,
    openInterestAtEnd,
  };
}

const methodology = {
  Volume: "Taker notional volume across all perpetual futures markets on QFEX (buy-side + sell-side taker notional, no double-counting of maker volume).",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-02-26",
  methodology,
};

export default adapter;
