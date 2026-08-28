import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";
import { httpPost } from "../../utils/fetchURL";

// https://docs.asterdex.com/usdaster-token/tokenomics
const buybackWalletToBurn = '0x5E4969C41ca9F9831468B98328A370b7AbD5a397';
const twapContract = '0xa6F7444D2b92Aa9F94a2165c77aAF2B671e63994';
const asterToken = '0x000ae314e2a2172a039b26378814c252734f556a';

const ASTER_RPC_URL = "https://tapi.asterdex.com/info";
const BUYBACK_WALLET = "0xa0edBaBcb48034e368de286b49F9603C7AfA1b60";
const MAX_RECORDS = 1000; // RPC hard cap per response

interface AsterFill {
  symbol: string;
  side: "BUY" | "SELL";
  price: string;
  qty: string;
  time: number;
}

async function getSpotFills(fromMs: number, toMs: number): Promise<AsterFill[]> {
  const res = await httpPost(ASTER_RPC_URL, {
    id: 1,
    jsonrpc: "2.0",
    method: "aster_spotUserFills",
    params: [BUYBACK_WALLET, null, fromMs, toMs - 1, "latest"],
  });
  const fills: AsterFill[] = res?.result?.fills ?? [];

  if (fills.length >= MAX_RECORDS && toMs - fromMs > 60_000) {
    const mid = Math.floor((fromMs + toMs) / 2);
    return [
      ...(await getSpotFills(fromMs, mid)),
      ...(await getSpotFills(mid, toMs)),
    ];
  }
  return fills;
}

async function fetch(options: FetchOptions) {
  const buybacksToBurn = await addTokensReceived({
    options,
    target: buybackWalletToBurn,
    fromAddressFilter: twapContract,
    token: asterToken,
  });

  const dailyHoldersRevenue = buybacksToBurn.clone(1, METRIC.TOKEN_BUY_BACK);

  return {
    dailyHoldersRevenue,
  }
}

async function fetchAster(options: FetchOptions) {
  const dailyHoldersRevenue = options.createBalances();

  const fromMs = options.startTimestamp * 1000;
  const toMs = options.endTimestamp * 1000;
  const fills = await getSpotFills(fromMs, toMs);
  for (const f of fills) {
    if (f.symbol === "ASTERUSDT" && f.side === "BUY") {
      dailyHoldersRevenue.addUSDValue(
        Number(f.qty) * Number(f.price),
        METRIC.TOKEN_BUY_BACK,
      );
    }
  }

  return { dailyHoldersRevenue };
}

const methodology = {
  HoldersRevenue:
    "Aster token strategic buybacks from platform fees. Used to be burnt before Feb 2nd, 2026; from Jun 17th, 2026, " +
    "99% of daily platform fees buy back ASTER via TWAP on Aster Spot (wallet 0xa0edBaBcb48034e368de286b49F9603C7AfA1b60) " +
    "and are distributed to veASTER stakers; an equal amount which is burned from reserve is not included as they are not sourced from revenue..",
}

const breakdownMethodology = {
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]:
      "Aster tokens purchased by the protocol treasury through TWAP for strategic buybacks, funded by accumulated platform fees. " +
      "Pre-Feb 2nd 2026: burnt. From Jun 17th 2026: measured as ASTERUSDT BUY fills by the public buyback wallet on Aster Chain.",
  }
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2026-01-19',
      deadFrom: '2026-02-03', //buybacks stopped
    },
    [CHAIN.ASTER]: {
      fetch: fetchAster,
      start: '2026-06-17',
    },
  },
  methodology,
  breakdownMethodology,
}

export default adapter;
