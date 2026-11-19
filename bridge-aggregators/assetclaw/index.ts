// AssetClaw (https://assetclaw.xyz) - privacy-first cross-chain bridge for Asset Chain.
// It routes transfers over three routes:
//
// 1. RWA Native - Asset Chain's native token bridges. ON-CHAIN, volume and fees.
//    The bridge contracts are shared with every Asset Chain app, so a deposit is only
//    counted when the same wallet pays AssetClaw's fee to the AssetClaw treasury, in the
//    same token, in the same tx or up to 20 minutes later.
//    Native-coin routes (RWA, Bitlayer BTC) pay the fee as a plain value transfer that
//    leaves no log, so they are not counted here: a lower bound.
//
// 2. Privacy and 3. Standard - orders placed through SilentSwap with AssetClaw's
//    integrator id. A privacy route cannot be attributed on-chain (that is its point),
//    so this VOLUME comes from AssetClaw's own API: every order is reported with its
//    deposit tx, checked on-chain by the backend (tx succeeded, sent by the user, value
//    moved), deduplicated, priced and kept as hourly totals per source chain. Fees on
//    these routes are not reported (self-reported, cannot be verified on-chain).
//    API: GET https://assetclaw-backend.onrender.com/api/stats/daily?start=<unix>&end=<unix>
//    (whole hours, max 48h; answers any past window).
//    The API also reports a `native` route (the same transfers as route 1, counted here
//    on-chain instead) and a `bot` route (the AssetClaw Trading Agent, a Telegram trading
//    bot, @assetclawbot); neither is read from the API.

import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API = "https://assetclaw-backend.onrender.com/api/stats/daily";
// API route key -> volume breakdown label
const API_ROUTES: Record<string, string> = {
  privacy: "Privacy Route",
  standard: "Standard Route",
};
const NATIVE_ROUTE = "RWA Native Route";
const BRIDGE_FEES = "Bridge Fees";
const BRIDGE_FEES_TO_TREASURY = "Bridge Fees To Treasury";

const apiCache: Record<string, Promise<any>> = {};
const apiWindow = (start: number, end: number) =>
  (apiCache[start + "-" + end] ||= fetchURL(`${API}?start=${start}&end=${end}`).then((r: any) => {
    if (!r || r.success !== true || !r.routes) throw new Error("AssetClaw API: bad response");
    // A route missing from the response is an API problem, not a zero-volume window.
    for (const route of Object.keys(API_ROUTES))
      if (!r.routes[route]?.byChain) throw new Error(`AssetClaw API: no ${route} route in response`);
    return r;
  }));

const TREASURY = "0x8029F31cCfEEAE24c0BA3338b0B4A63519fba146";
const SENT_TOKENS = "event SentTokens(address fromUser, string indexed toUser, string fromChain, string toChain, uint256 amount, uint256 exchangeRate)";
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// AssetClaw fee: 1% of the amount ("Low fee (1%)" on https://assetclaw.xyz).
// Genesis 625 NFT holders pay 0.5% (not stated on the site).
// A fee is accepted between 0.35% and 1.3% of the bridged amount, so both rates
// match with room for rounding.
const FEE_MIN_BPS = 35n, FEE_MAX_BPS = 130n;

const START = "2026-11-09"; // public launch day

// Per chain:
//  chainId - source chain id of a Privacy / Standard order in the API (orders from
//            chains not listed here are not counted).
//  routes  - RWA Native route: [token, Asset Chain native bridge contract for it].
const chainConfig: Record<string, { chainId: number; start: string; routes?: [string, string][] }> = {
  [CHAIN.ASSETCHAIN]: {
    chainId: 42420, start: START, routes: [
      ["0x2B7C1342Cc64add10B2a79C8f9767d2667DE64B2", "0xA6c8B33edD4894E42d0C5585fEC52aAC6FF9147d"], // USDC
      ["0xDBDc8c7B96286899aB624F6a59dd0250DD4Ce9bC", "0x08d4a11Fb4fFE7022deBbBbcBb7444005B09a2FC"], // BTC
      ["0x26E490d30e73c36800788DC6d6315946C4BbEa24", "0x196434734f09DFE6D479b5a248a45cfbe516382a"], // USDT
      ["0xEc6943BB984AED25eC96986898721a7f8aB6212E", "0x8D03A4E2dBfbf13043Bde6278658EFfCE6FE6b02"], // WNT
      ["0x02afe9989D86a0357fbb238579FE035dc17BcAB0", "0x14d65D3E8491E51742a237Ce84993897bBA13131"], // xRWA
    ],
  },
  [CHAIN.BSC]: {
    chainId: 56, start: START, routes: [
      [ADDRESSES.bsc.USDT, "0x0FFE2dA242E959a7446Abb56A8f2626D0DC4fce7"],
    ],
  },
  [CHAIN.BASE]: {
    chainId: 8453, start: START, routes: [
      [ADDRESSES.base.USDC, "0x5E007f834b6Ee2fcdA41631AD444b4dAAEc372b0"],
      [ADDRESSES.base.WETH, "0xEd87e9170152A12a4D3904F5cdE323b35d880858"],
    ],
  },
  [CHAIN.ETHEREUM]: {
    chainId: 1, start: START, routes: [
      [ADDRESSES.ethereum.USDC, "0x85FCf4D25895Eeb5306643777F1205331415F51a"],
      [ADDRESSES.ethereum.WBTC, "0xc415231cc96d20d99248706403B7580bE560c140"],
      [ADDRESSES.ethereum.USDT, "0x26fa2991f15473B3502D767b49e5805753b8F7F8"],
      [ADDRESSES.ethereum.WETH, "0x1B2322a56f43DBDcB19fcd97527EeB734EEeD119"],
    ],
  },
  [CHAIN.ARBITRUM]: {
    chainId: 42161, start: START, routes: [
      [ADDRESSES.arbitrum.USDT, "0x475d2Ff7955c5359D31B19DC275be3a466f035D5"],
      ["0xAD4b9c1FbF4923061814dD9d5732EB703FaA53D4", "0x0FFE2dA242E959a7446Abb56A8f2626D0DC4fce7"], // WNT
      ["0x3096e7BFd0878Cc65be71f8899Bc4CFB57187Ba3", "0x5116990d844bda038DBD037D943FcB7481b5Fee7"], // xRWA
      [ADDRESSES.arbitrum.WETH, "0x6377C8cC083d7CEB49fD3eE1244351BFB86C961e"],
    ],
  },
  [CHAIN.POLYGON]: {
    chainId: 137, start: START, routes: [
      [ADDRESSES.polygon.USDC_CIRCLE, "0x1B2322a56f43DBDcB19fcd97527EeB734EEeD119"],
      [ADDRESSES.polygon.USDT, "0x26fa2991f15473B3502D767b49e5805753b8F7F8"],
      ["0x82a0E6c02b91eC9f6ff943C0A933c03dBaa19689", "0x85FCf4D25895Eeb5306643777F1205331415F51a"], // WNT
    ],
  },
  // Privacy / Standard source chains only, no RWA Native route.
  [CHAIN.OPTIMISM]: { chainId: 10, start: START },
  [CHAIN.AVAX]: { chainId: 43114, start: START },
  // The other EVM source chains SilentSwap supports (Privacy / Standard only).
  [CHAIN.LINEA]: { chainId: 59144, start: START },
  [CHAIN.SCROLL]: { chainId: 534352, start: START },
  [CHAIN.ERA]: { chainId: 324, start: START },
  [CHAIN.BLAST]: { chainId: 81457, start: START },
  [CHAIN.UNICHAIN]: { chainId: 130, start: START },
  [CHAIN.WC]: { chainId: 480, start: START },
  [CHAIN.SONIC]: { chainId: 146, start: START },
  [CHAIN.BERACHAIN]: { chainId: 80094, start: START },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: START },
  [CHAIN.MONAD]: { chainId: 143, start: START },
  [CHAIN.XDAI]: { chainId: 100, start: START },
  [CHAIN.CELO]: { chainId: 42220, start: START },
  [CHAIN.RONIN]: { chainId: 2020, start: START },
  [CHAIN.MANTLE]: { chainId: 5000, start: START },
  [CHAIN.APECHAIN]: { chainId: 33139, start: START },
  [CHAIN.ABSTRACT]: { chainId: 2741, start: START },
  [CHAIN.INK]: { chainId: 57073, start: START },
  [CHAIN.ZORA]: { chainId: 7777777, start: START },
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: START },
  [CHAIN.CRONOS]: { chainId: 25, start: START },
  [CHAIN.KATANA]: { chainId: 747474, start: START },
  [CHAIN.MODE]: { chainId: 34443, start: START },
  [CHAIN.MANTA]: { chainId: 169, start: START },
  [CHAIN.MEGAETH]: { chainId: 4326, start: START },
  [CHAIN.BOBA]: { chainId: 288, start: START },
  [CHAIN.PLASMA]: { chainId: 9745, start: START },
};

const pad = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const fits = (fee: bigint, amount: bigint) =>
  amount > 0n && fee * 10000n >= amount * FEE_MIN_BPS && fee * 10000n <= amount * FEE_MAX_BPS;
const logOrder = (a: any, b: any) =>
  Number(a.blockNumber) - Number(b.blockNumber) || Number(a.logIndex ?? a.index) - Number(b.logIndex ?? b.index);

// Whole UTC hours, as the API requires (pullHourly windows already are; this
// only matters for ad-hoc runs such as the CLI test).
const HOUR = 3600;
const hourFloor = (t: number) => Math.floor(t / HOUR) * HOUR;

// A step-by-step wallet pays the fee in its next tx, a few minutes after the
// deposit (the AssetClaw backend allows 20 minutes).
const FEE_WINDOW_SEC = 20 * 60;

const fetch = async (options: FetchOptions) => {
  const { chain, getLogs, createBalances, startTimestamp, endTimestamp } = options;
  const { chainId, routes = [] } = chainConfig[chain];
  const dailyBridgeVolume = createBalances();
  const dailyFees = createBalances();

  // Privacy + Standard volume that started on this chain (USD, from the API).
  const s = hourFloor(startTimestamp);
  const e = Math.max(hourFloor(endTimestamp), s + HOUR);
  const w = await apiWindow(s, e);
  for (const [route, label] of Object.entries(API_ROUTES)) {
    // byChain only lists chains with volume in the window.
    const usd = Number(w.routes[route].byChain[String(chainId)] ?? 0);
    if (!Number.isFinite(usd)) throw new Error(`AssetClaw API: bad ${route} volume for ${chain}`);
    if (usd > 0) dailyBridgeVolume.addUSDValue(usd, label);
  }

  if (routes.length) {
    // Anchored on the FEE: every fee paid to the treasury in this window is looked
    // up against deposits by the same wallet in the 20 minutes up to it. So each
    // fee counts once, in the window it was paid, and a deposit whose fee lands in
    // the next window is counted there rather than lost.
    // Fees paid in the 20 minutes before the window are replayed too (not counted),
    // so a deposit already matched by an earlier fee is not matched again here.
    const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
    const secsPerBlock = Math.max((endTimestamp - startTimestamp) / Math.max(toBlock - fromBlock, 1), 0.05);
    const lookback = Math.ceil(FEE_WINDOW_SEC / secsPerBlock);

    const [depositsByRoute, feesByRoute]: any[][][] = await Promise.all([
      getLogs({ targets: routes.map(([, bridge]) => bridge), eventAbi: SENT_TOKENS, onlyArgs: false, flatten: false, fromBlock: Math.max(fromBlock - 2 * lookback, 0), toBlock }),
      getLogs({ targets: routes.map(([token]) => token), eventAbi: TRANSFER, topics: [TRANSFER_TOPIC, null, pad(TREASURY)], onlyArgs: false, flatten: false, fromBlock: Math.max(fromBlock - lookback, 0), toBlock }),
    ]);

    routes.forEach(([token], i) => {
      // Deposits by sender, newest first.
      const bySender = new Map<string, any[]>();
      for (const d of depositsByRoute[i]) {
        const k = String(d.args.fromUser).toLowerCase();
        if (!bySender.has(k)) bySender.set(k, []);
        bySender.get(k)!.push(d);
      }
      for (const list of bySender.values()) list.sort((a, b) => logOrder(b, a));

      const used = new Set<any>();
      for (const f of [...feesByRoute[i]].sort(logOrder)) {
        const list = bySender.get(String(f.args.from).toLowerCase());
        if (!list) continue; // not paid by a bridge user
        const fee = BigInt(f.args.value);
        const fb = Number(f.blockNumber);
        const ok = (d: any) => !used.has(d)
          && Number(d.blockNumber) <= fb && Number(d.blockNumber) >= fb - lookback
          && fits(fee, BigInt(d.args.amount));
        // Same transaction first (one-signature wallets), else the latest deposit before the fee.
        const d = list.find((x) => ok(x) && x.transactionHash === f.transactionHash) || list.find(ok);
        if (!d) continue; // not an AssetClaw transfer
        used.add(d);
        if (fb < fromBlock) continue; // paid before this window: counted in the previous one
        dailyBridgeVolume.add(token, BigInt(d.args.amount), NATIVE_ROUTE);
        dailyFees.add(token, fee, BRIDGE_FEES);
      }
    });
  }

  const dailyRevenue = dailyFees.clone(1, BRIDGE_FEES_TO_TREASURY);
  return { dailyBridgeVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const methodology = {
  BridgeVolume: "RWA Native route: deposits into Asset Chain's native bridge contracts made through AssetClaw, identified on-chain by the AssetClaw fee paid by the same wallet in the same token (native-coin routes not counted). Privacy and Standard routes (SilentSwap orders placed through AssetClaw): volume from AssetClaw's API, where every order is checked on-chain by its deposit tx before it counts, by source chain.",
  Fees: "RWA Native route only: the AssetClaw fee paid to the treasury, 1% of the amount, 0.5% for Genesis 625 NFT holders. Privacy and Standard route fees are not counted.",
  Revenue: "The AssetClaw fee on RWA Native route transfers, all kept by the AssetClaw treasury.",
  ProtocolRevenue: "The AssetClaw fee on RWA Native route transfers, all sent to the AssetClaw treasury.",
};

const breakdownMethodology = {
  BridgeVolume: {
    [NATIVE_ROUTE]: "Deposits into Asset Chain's native bridge contracts made through AssetClaw, matched on-chain to the AssetClaw fee paid by the same wallet.",
    [API_ROUTES.privacy]: "SilentSwap privacy orders placed through AssetClaw, by source chain, from AssetClaw's API.",
    [API_ROUTES.standard]: "SilentSwap standard orders placed through AssetClaw, by source chain, from AssetClaw's API.",
  },
  Fees: {
    [BRIDGE_FEES]: "AssetClaw fee on RWA Native route transfers, 1% of the amount, 0.5% for Genesis 625 NFT holders.",
  },
  Revenue: {
    [BRIDGE_FEES_TO_TREASURY]: "All RWA Native route fees, kept by the AssetClaw treasury.",
  },
  ProtocolRevenue: {
    [BRIDGE_FEES_TO_TREASURY]: "All RWA Native route fees, sent to the AssetClaw treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Privacy and Standard orders are also counted in SilentSwap's own volume. The flag
  // covers the whole listing, so the RWA Native route is excluded from aggregates too.
  doublecounted: true,
  methodology,
  breakdownMethodology,
  fetch,
  adapter: chainConfig, // start dates are read from chainConfig per chain
};

export default adapter;
