import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";

/**
 * Lista Lending (Moolah) protocol revenue.
 *
 * Both the market-level protocol fee (a % of borrow interest) and the self-operated
 * MoolahVault management fee (10% of vault yield) accrue to a single address:
 * LendingFeeRecipient. The contract team confirmed all self-operated vaults set
 * feeRecipient = LendingFeeRecipient, so revenue is measured as the value accrued to it:
 *
 *   revenue(window) = Δ(value of LFR's market supply positions)   // market fee
 *                   + Δ(value of LFR's vault shares)              // vault management fee
 *                   + fees claimed to LFR during the window       // claiming empties the position
 *
 * Fees (borrow interest) is derived per market from its fee: interest = marketFee / feeRate.
 *
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-lending
 */

const MOOLAH: Record<string, string> = {
  [CHAIN.BSC]: "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C",
  [CHAIN.ETHEREUM]: "0xf820fB4680712CD7263a0D3D024D5b5aEA82Fd70",
};
const LENDING_FEE_RECIPIENT: Record<string, string> = {
  [CHAIN.BSC]: "0x2E2Eed557FAb1d2E11fEA1E1a23FF8f1b23551f3",
  [CHAIN.ETHEREUM]: "0xd10a024602E042dcb9C19e21682c3b896c8B0d30",
};

// Credit lending was paused on 2026-06-01; from then on its vault earns no protocol fee.
// Only exclude it for windows on/after the pause so earlier backfills keep the real fee.
const CREDIT_VAULT = "0x4e82fa869f8d05c8f94900d4652fdb82f3c7a004"; // BSC
const CREDIT_PAUSE_TS = 1780272000; // 2026-06-01T00:00:00Z

const WAD = 10n ** 18n;
const MARKET_PAGE_SIZE = 200;

const abi = {
  market:
    "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  position:
    "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  idToMarketParams:
    "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  balanceOf: "function balanceOf(address) view returns (uint256)",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
  asset: "function asset() view returns (address)",
  marketFeeClaimed:
    "event MarketFeeClaimed(bytes32 id, address token, uint256 assets, uint256 shares)",
  vaultFeeClaimed:
    "event VaultFeeClaimed(address vault, address token, uint256 assets, uint256 shares)",
};

const getMarketIds = async (chain: string): Promise<string[]> => {
  const url = (page: number) =>
    `https://api.lista.org/api/moolah/borrow/marketList?page=${page}&pageSize=${MARKET_PAGE_SIZE}`;
  const first: any = await getConfig(`lista-lending-markets-${chain}-1`, url(1));
  const list = [...(first.data?.list ?? [])];
  const pages = Math.ceil((first.data?.total ?? 0) / MARKET_PAGE_SIZE);
  for (let page = 2; page <= pages; page++) {
    const next: any = await getConfig(`lista-lending-markets-${chain}-${page}`, url(page));
    list.push(...(next.data?.list ?? []));
  }
  return list
    .filter((m: any) => m.chain === chain && m.status === 1)
    .map((m: any) => m.marketId);
};

const getVaults = async (chain: string, startTimestamp: number): Promise<string[]> => {
  const data: any = await getConfig(
    `lista-lending-vaults-${chain}`,
    `https://api.lista.org/api/moolah/vault/list?page=1&pageSize=100&sort=depositsUsd&order=desc&chain=${chain}`
  );
  const excludeCredit = startTimestamp >= CREDIT_PAUSE_TS;
  return (data.data?.list ?? [])
    .map((v: any) => v.address.toLowerCase())
    .filter((a: string) => !(excludeCredit && a === CREDIT_VAULT));
};

// clamp negatives (rounding / retro-adjustments) to 0, like the protocol's own daily report
const addNet = (bal: any, token: string, amount: bigint) => {
  if (amount > 0n) bal.add(token, amount);
};

const fetch = async (options: FetchOptions) => {
  const { chain } = options;
  const moolah = MOOLAH[chain];
  const lfr = LENDING_FEE_RECIPIENT[chain];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const marketIds = await getMarketIds(chain);
  const vaults = await getVaults(chain, options.startTimestamp);

  // ---- claims during the window (add back: claiming empties the accrued position) ----
  const [marketClaimLogs, vaultClaimLogs] = await Promise.all([
    options.getLogs({ target: lfr, eventAbi: abi.marketFeeClaimed }),
    options.getLogs({ target: lfr, eventAbi: abi.vaultFeeClaimed }),
  ]);
  const marketClaimById: Record<string, { token: string; assets: bigint }> = {};
  marketClaimLogs.forEach((l: any) => {
    const id = String(l.id).toLowerCase();
    const prev = marketClaimById[id];
    marketClaimById[id] = { token: String(l.token).toLowerCase(), assets: (prev?.assets ?? 0n) + BigInt(l.assets) };
  });
  const vaultClaimByToken: Record<string, bigint> = {};
  vaultClaimLogs.forEach((l: any) => {
    const t = String(l.token).toLowerCase();
    vaultClaimByToken[t] = (vaultClaimByToken[t] ?? 0n) + BigInt(l.assets);
  });

  // ---- markets: per-market fee accrual (fee = LFR supply-position delta + claims) ----
  if (marketIds.length) {
    const params = await options.api.multiCall({
      abi: abi.idToMarketParams,
      calls: marketIds.map((id) => ({ target: moolah, params: [id] })),
      permitFailure: true,
    });
    const [mFrom, mTo, pFrom, pTo] = await Promise.all([
      options.fromApi.multiCall({ abi: abi.market, calls: marketIds.map((id) => ({ target: moolah, params: [id] })), permitFailure: true }),
      options.toApi.multiCall({ abi: abi.market, calls: marketIds.map((id) => ({ target: moolah, params: [id] })), permitFailure: true }),
      options.fromApi.multiCall({ abi: abi.position, calls: marketIds.map((id) => ({ target: moolah, params: [id, lfr] })), permitFailure: true }),
      options.toApi.multiCall({ abi: abi.position, calls: marketIds.map((id) => ({ target: moolah, params: [id, lfr] })), permitFailure: true }),
    ]);

    const sharesToAssets = (shares: bigint, m: any) => {
      const tss = BigInt(m.totalSupplyShares);
      return tss === 0n ? 0n : (shares * BigInt(m.totalSupplyAssets)) / tss;
    };

    // per-market: { loanToken, net fee (loanToken units), feeRate (WAD) }
    const perMarket: Record<string, { token: string; fee: bigint; rate: bigint }> = {};
    marketIds.forEach((id, i) => {
      const mp = params[i], a = mFrom[i], b = mTo[i], pa = pFrom[i], pb = pTo[i];
      // require BOTH endpoints — a missing fromApi read would report the whole accrued position as fee
      if (!mp || !a || !b || !pa || !pb) return;
      const delta = sharesToAssets(BigInt(pb.supplyShares), b) - sharesToAssets(BigInt(pa.supplyShares), a);
      perMarket[String(id).toLowerCase()] = { token: String(mp.loanToken).toLowerCase(), fee: delta, rate: BigInt(b.fee) };
    });
    // fold in claims (realized fees; positionDelta already went negative for them)
    for (const [id, c] of Object.entries(marketClaimById)) {
      if (perMarket[id]) perMarket[id].fee += c.assets;
      else perMarket[id] = { token: c.token, fee: c.assets, rate: 0n };
    }
    for (const { token, fee, rate } of Object.values(perMarket)) {
      if (fee <= 0n) continue;
      // interest = marketFee / feeRate (WAD-scaled). Fall back to the standard 10% when the
      // rate is unknown (claim from a market not in the current list).
      const interest = rate > 0n ? (fee * WAD) / rate : fee * 10n;
      addNet(dailyRevenue, token, fee);
      addNet(dailyFees, token, interest);
      addNet(dailySupplySideRevenue, token, interest - fee); // lender share
    }
  }

  // ---- vaults: LFR vault-share value delta -> vault management fee (revenue) ----
  if (vaults.length) {
    const assets = await options.api.multiCall({ abi: abi.asset, calls: vaults, permitFailure: true });
    const [balFrom, balTo] = await Promise.all([
      options.fromApi.multiCall({ abi: abi.balanceOf, calls: vaults.map((v) => ({ target: v, params: [lfr] })), permitFailure: true }),
      options.toApi.multiCall({ abi: abi.balanceOf, calls: vaults.map((v) => ({ target: v, params: [lfr] })), permitFailure: true }),
    ]);
    const [assetsFrom, assetsTo] = await Promise.all([
      options.fromApi.multiCall({ abi: abi.convertToAssets, calls: vaults.map((v, i) => ({ target: v, params: [balFrom[i] ?? 0] })), permitFailure: true }),
      options.toApi.multiCall({ abi: abi.convertToAssets, calls: vaults.map((v, i) => ({ target: v, params: [balTo[i] ?? 0] })), permitFailure: true }),
    ]);
    const vaultFeeByToken: Record<string, bigint> = {};
    vaults.forEach((_, i) => {
      const token = assets[i]?.toLowerCase();
      if (!token) return;
      // require both endpoints — a missing fromApi balance would report the whole share value as fee
      if (balFrom[i] == null || balTo[i] == null) return;
      const fee = BigInt(assetsTo[i] ?? 0) - BigInt(assetsFrom[i] ?? 0);
      if (fee !== 0n) vaultFeeByToken[token] = (vaultFeeByToken[token] ?? 0n) + fee;
    });
    for (const [t, amt] of Object.entries(vaultClaimByToken)) {
      vaultFeeByToken[t] = (vaultFeeByToken[t] ?? 0n) + amt;
    }
    // Vault fee is taken from the supply-side yield (already inside the borrow interest counted
    // above): it is revenue, and it reduces the lender share — so it is NOT added to Fees again,
    // but IS subtracted from SupplySideRevenue. This keeps Fees = Revenue + SupplySideRevenue.
    for (const [t, amt] of Object.entries(vaultFeeByToken)) {
      if (amt <= 0n) continue;
      dailyRevenue.add(t, amt);
      dailySupplySideRevenue.subtractToken(t, amt);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total interest paid by borrowers across all Moolah markets (derived from the market protocol fee and each market's fee rate).",
  Revenue: "Protocol fee accrued to LendingFeeRecipient: the market-level fee (a % of borrow interest) plus the 10% management fee on self-operated MoolahVaults.",
  ProtocolRevenue: "Same as Revenue — all lending fees are collected by Lista DAO via LendingFeeRecipient.",
  SupplySideRevenue: "Interest paid to lenders (borrow interest minus the market protocol fee).",
};

const adapter: SimpleAdapter = {
  version: 2,
  isExpensiveAdapter: true,
  pullHourly: false, // compares fromApi/toApi snapshots over the window; no hourly retrieval needed
  methodology,
  adapter: {
    [CHAIN.BSC]: { fetch, start: "2025-04-16" },
    // Lista Lending launched on Ethereum later.
    [CHAIN.ETHEREUM]: { fetch, start: "2025-10-02" },
  },
};

export default adapter;
