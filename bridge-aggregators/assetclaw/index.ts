// AssetClaw (https://assetclaw.xyz) - privacy-first cross-chain bridge for Asset Chain.
// It routes transfers over three routes:
//
// 1. RWA Native - Asset Chain's native token bridges. ON-CHAIN, volume and fees.
//    The bridge contracts are shared with every Asset Chain app, so a deposit is only
//    counted when the same wallet pays AssetClaw's fee (1%, 0.5% for Genesis holders)
//    to the AssetClaw treasury, in the same token, in the same tx or up to 20 minutes later.
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

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API = "https://assetclaw-backend.onrender.com/api/stats/daily";
// Source chain of a Privacy / Standard order, by chain id. Orders from other chains
// are not counted.
const CHAIN_IDS: Record<string, number> = {
  [CHAIN.ASSETCHAIN]: 42420, [CHAIN.BSC]: 56, [CHAIN.BASE]: 8453, [CHAIN.ETHEREUM]: 1,
  [CHAIN.ARBITRUM]: 42161, [CHAIN.POLYGON]: 137, [CHAIN.OPTIMISM]: 10, [CHAIN.AVAX]: 43114,
};
const apiCache: Record<string, Promise<any>> = {};
const apiWindow = (start: number, end: number) =>
  (apiCache[start + "-" + end] ||= fetchURL(`${API}?start=${start}&end=${end}`).then((r: any) => {
    if (!r || r.success !== true || !r.routes) throw new Error("AssetClaw API: bad response");
    return r;
  }));

const TREASURY = "0x8029F31cCfEEAE24c0BA3338b0B4A63519fba146";
const SENT_TOKENS = "event SentTokens(address fromUser, string indexed toUser, string fromChain, string toChain, uint256 amount, uint256 exchangeRate)";
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Fee / bridged amount in basis points, with margins (charged: 100, holders 50).
const FEE_MIN_BPS = 35n, FEE_MAX_BPS = 130n;

// chain -> [token, native bridge contract]
const ROUTES: Record<string, [string, string][]> = {
  [CHAIN.ASSETCHAIN]: [
    ["0x2B7C1342Cc64add10B2a79C8f9767d2667DE64B2", "0xA6c8B33edD4894E42d0C5585fEC52aAC6FF9147d"], // USDC
    ["0xDBDc8c7B96286899aB624F6a59dd0250DD4Ce9bC", "0x08d4a11Fb4fFE7022deBbBbcBb7444005B09a2FC"], // BTC
    ["0x26E490d30e73c36800788DC6d6315946C4BbEa24", "0x196434734f09DFE6D479b5a248a45cfbe516382a"], // USDT
    ["0xEc6943BB984AED25eC96986898721a7f8aB6212E", "0x8D03A4E2dBfbf13043Bde6278658EFfCE6FE6b02"], // WNT
    ["0x02afe9989D86a0357fbb238579FE035dc17BcAB0", "0x14d65D3E8491E51742a237Ce84993897bBA13131"], // xRWA
  ],
  [CHAIN.BSC]: [
    ["0x55d398326f99059fF775485246999027B3197955", "0x0FFE2dA242E959a7446Abb56A8f2626D0DC4fce7"], // USDT
  ],
  [CHAIN.BASE]: [
    ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "0x5E007f834b6Ee2fcdA41631AD444b4dAAEc372b0"], // USDC
    ["0x4200000000000000000000000000000000000006", "0xEd87e9170152A12a4D3904F5cdE323b35d880858"], // WETH
  ],
  [CHAIN.ETHEREUM]: [
    ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "0x85FCf4D25895Eeb5306643777F1205331415F51a"], // USDC
    ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", "0xc415231cc96d20d99248706403B7580bE560c140"], // WBTC
    ["0xdAC17F958D2ee523a2206206994597C13D831ec7", "0x26fa2991f15473B3502D767b49e5805753b8F7F8"], // USDT
    ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x1B2322a56f43DBDcB19fcd97527EeB734EEeD119"], // WETH
  ],
  [CHAIN.ARBITRUM]: [
    ["0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "0x475d2Ff7955c5359D31B19DC275be3a466f035D5"], // USDT
    ["0xAD4b9c1FbF4923061814dD9d5732EB703FaA53D4", "0x0FFE2dA242E959a7446Abb56A8f2626D0DC4fce7"], // WNT
    ["0x3096e7BFd0878Cc65be71f8899Bc4CFB57187Ba3", "0x5116990d844bda038DBD037D943FcB7481b5Fee7"], // xRWA
    ["0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "0x6377C8cC083d7CEB49fD3eE1244351BFB86C961e"], // WETH
  ],
  [CHAIN.POLYGON]: [
    ["0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "0x1B2322a56f43DBDcB19fcd97527EeB734EEeD119"], // USDC
    ["0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "0x26fa2991f15473B3502D767b49e5805753b8F7F8"], // USDT
    ["0x82a0E6c02b91eC9f6ff943C0A933c03dBaa19689", "0x85FCf4D25895Eeb5306643777F1205331415F51a"], // WNT
  ],
};

const pad = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const fits = (fee: bigint, amount: bigint) =>
  amount > 0n && fee * 10000n >= amount * FEE_MIN_BPS && fee * 10000n <= amount * FEE_MAX_BPS;

// Whole UTC hours, as the API requires (pullHourly windows already are; this
// only matters for ad-hoc runs such as the CLI test).
const HOUR = 3600;
const hourFloor = (t: number) => Math.floor(t / HOUR) * HOUR;

// A step-by-step wallet pays the fee in its next tx, a few minutes after the
// deposit (the AssetClaw backend allows 20 minutes).
const FEE_WINDOW_SEC = 20 * 60;

const fetch = async (options: FetchOptions) => {
  const { chain, getLogs, createBalances, startTimestamp, endTimestamp } = options;
  const dailyBridgeVolume = createBalances();
  const dailyFees = createBalances();

  // Privacy + Standard volume that started on this chain (USD, from the API).
  const s = hourFloor(startTimestamp);
  const e = Math.max(hourFloor(endTimestamp), s + HOUR);
  const w = await apiWindow(s, e);
  for (const route of ["privacy", "standard"]) {
    const usd = Number(w.routes[route]?.byChain?.[String(CHAIN_IDS[chain])] || 0);
    if (usd > 0) dailyBridgeVolume.addUSDValue(usd);
  }

  const routes = ROUTES[chain] || [];
  if (!routes.length) return { dailyBridgeVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };

  // Anchored on the FEE: every fee paid to the treasury in this window is looked
  // up against deposits by the same wallet in the 20 minutes up to it. So each
  // fee counts once, in the window it was paid, and a deposit whose fee lands in
  // the next window is counted there rather than lost.
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const secsPerBlock = Math.max((endTimestamp - startTimestamp) / Math.max(toBlock - fromBlock, 1), 0.05);
  const lookback = Math.ceil(FEE_WINDOW_SEC / secsPerBlock);

  for (const [token, bridge] of routes) {
    const [deposits, fees]: any[][] = await Promise.all([
      getLogs({ target: bridge, eventAbi: SENT_TOKENS, onlyArgs: false, fromBlock: Math.max(fromBlock - lookback, 0), toBlock }),
      getLogs({ target: token, eventAbi: TRANSFER, topics: [TRANSFER_TOPIC, null, pad(TREASURY)], onlyArgs: false }),
    ]);
    // Deposits by sender, newest first.
    const bySender = new Map<string, any[]>();
    for (const d of deposits) {
      const k = String(d.args.fromUser).toLowerCase();
      if (!bySender.has(k)) bySender.set(k, []);
      bySender.get(k)!.push(d);
    }
    for (const list of bySender.values()) list.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

    const used = new Set<any>();
    for (const f of fees) {
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
      dailyBridgeVolume.add(token, BigInt(d.args.amount));
      dailyFees.add(token, fee);
    }
  }

  return { dailyBridgeVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  BridgeVolume: "RWA Native route: deposits into Asset Chain's native bridge contracts made through AssetClaw, identified on-chain by the AssetClaw fee paid by the same wallet in the same token (native-coin routes not counted). Privacy and Standard routes (SilentSwap orders placed through AssetClaw): volume from AssetClaw's API, where every order is checked on-chain by its deposit tx before it counts, by source chain.",
  Fees: "RWA Native route only: the AssetClaw fee paid to the treasury, 1% of the amount, 0.5% for Genesis 625 NFT holders. Privacy and Standard route fees are not counted.",
  Revenue: "All fees go to the AssetClaw treasury.",
  ProtocolRevenue: "All fees go to the AssetClaw treasury.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  fetch,
  chains: Object.keys(CHAIN_IDS),
  start: "2026-11-09", // public launch day
};

export 
                     default adapter;
