import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getConfig } from "../../helpers/cache";
import { addTokensReceived } from "../../helpers/token";
import { ethers } from "ethers";

/**
 * Lista Lending (Moolah) — a Morpho-Blue fork on BSC and Ethereum.
 *
 * Fees / SupplySide / Revenue are derived from on-chain interest accrual (same shape as the
 * canonical Morpho adapter), so the full borrow interest — including the yield earned by
 * suppliers/lenders — is captured, not only Lista's protocol cut:
 *
 *   - Fees              = total borrow interest across all markets (Moolah `AccrueInterest.interest`)
 *                         plus the fixed interest of the broker-run fixed-term markets, which never
 *                         touches Moolah's accrual.
 *   - Revenue           = Lista's protocol cut = market protocol fee (interest × market.fee) +
 *                         MoolahVault management fee (vault `AccrueInterest.feeShares`, only for the
 *                         self-operated vaults whose feeRecipient is Lista's LendingFeeRecipient).
 *   - SupplySideRevenue = Fees − Revenue = interest distributed to suppliers/lenders.
 *
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-lending
 */

const WAD = 10n ** 18n;

const MOOLAH: Record<string, string> = {
  [CHAIN.BSC]: "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C",
  [CHAIN.ETHEREUM]: "0xf820fB4680712CD7263a0D3D024D5b5aEA82Fd70",
};
// Lista's LendingFeeRecipient — the fee recipient set on self-operated MoolahVaults. Used to keep
// only Lista's own vaults (third-party curators route their fee elsewhere).
const LENDING_FEE_RECIPIENT: Record<string, string> = {
  [CHAIN.BSC]: "0x2E2Eed557FAb1d2E11fEA1E1a23FF8f1b23551f3",
  [CHAIN.ETHEREUM]: "0xd10a024602E042dcb9C19e21682c3b896c8B0d30",
};
const API_CHAIN: Record<string, string> = {
  [CHAIN.BSC]: "bsc",
  [CHAIN.ETHEREUM]: "ethereum",
};

// DAO lending-position yield reclassification (BSC only, live 2026-08-24, moolah#229).
// The DAO supplies ~99.9995% of the lisUSD MoolahVault, so its share of supplier interest is booked in
// SupplySideRevenue above. When that yield is claimed via MoolahVaultAccount.claimYield and routed to
// the DAO's revenue recipient, the protocol keeps it as platform revenue (the recipient swaps it to
// USDT and forwards to the treasury multisig — it is NOT used to buy back LISTA, confirmed with the
// Lista contract team), so we move it from SupplySideRevenue to ProtocolRevenue. Fees are unchanged
// (a re-classification, not new income). MoolahVaultAccount only moves lisUSD to its whitelisted
// recipients through claimYield, so a lisUSD Transfer out of it equals the YieldPaid amount. The other
// whitelisted leg (LisUSDPoolSet / sLisUSD savers) is third-party supply and stays supply-side. Lumpy
// per day (a claim realises yield accrued over many prior days) but conserved cumulatively.
const MOOLAH_VAULT_ACCOUNT: Record<string, string> = {
  [CHAIN.BSC]: "0xA0b8b78208Cfe45dDC7AC7B51B108B2742B32652",
};
const LISUSD_BSC = "0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5";
const DAO_YIELD_RECIPIENT_BSC = "0x3b99A4177E3f430590A8473f353dD87a5a2e1BfC"; // DAO position-yield recipient -> swapped to USDT, forwarded to treasury (NOT a LISTA buy-back)
const VAULT_PAGE_SIZE = 100;
const vaultListUrl = (chain: string, page: number) =>
  `https://api.lista.org/api/moolah/vault/list?page=${page}&pageSize=${VAULT_PAGE_SIZE}&sort=depositsUsd&order=desc&chain=${API_CHAIN[chain]}`;
// The market list ignores a `chain` filter and always returns every chain, so it is fetched once for
// both and the entries are filtered on their own `chain` field. 200 is the endpoint's page cap.
const MARKET_PAGE_SIZE = 200;
const marketListUrl = (page: number) =>
  `https://api.lista.org/api/moolah/borrow/marketList?page=${page}&pageSize=${MARKET_PAGE_SIZE}`;

const abis = {
  AccrueInterest:
    "event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)",
  idToMarketParams:
    "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  market:
    "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  VaultAccrueInterest: "event AccrueInterest(uint256 newTotalAssets, uint256 feeShares)",
  ProtocolFeeCharged: "event ProtocolFeeCharged(address indexed broker, address indexed feeRecipient, uint256 fee)",
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
};
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Paginate a Lista list endpoint; throw (rather than silently under-report) if the API/cache
// returns a response that cannot be paginated to completion.
const getPagedList = async (cacheKey: string, pageSize: number, urlFor: (page: number) => string): Promise<any[]> => {
  const items: any[] = [];
  let page = 1;
  while (true) {
    const res = await getConfig(`${cacheKey}-${page}`, urlFor(page));
    const list = res?.data?.list;
    if (!Array.isArray(list)) throw new Error(`Lista list unavailable: ${cacheKey}`);
    // `Number(null)` and `Number("")` are both 0, so a missing `total` has to be rejected before the
    // finite check or the walk stops after page one and quietly returns part of the inventory —
    // the failure this adapter already got bitten by once.
    const { total } = res.data;
    if (total == null || !Number.isFinite(Number(total))) throw new Error(`Lista list has no usable total: ${cacheKey}`);
    const expected = Number(total);
    items.push(...list);
    // `total` is re-read from every page, so it tracks the server's current count: promising fewer
    // rows than it has already handed over is the `total: 0` / `total: ""` shape, both of which
    // coerce to a finite 0 and would otherwise end the walk on page one with a fraction of the
    // inventory. A full page proves nothing on its own — an inventory that happens to be an exact
    // multiple of the page size ends on one.
    if (expected < items.length) throw new Error(`Lista list total below returned rows: ${cacheKey} (${items.length}/${expected})`);
    if (items.length === expected) return items;
    // The server contradicting itself the other way: it promised more than it is willing to hand
    // over. Throw rather than return a silently short inventory.
    if (list.length < pageSize) throw new Error(`Lista list ended early: ${cacheKey} (${items.length}/${expected})`);
    page++;
  }
};

const getVaultAddresses = async (chain: string): Promise<string[]> => {
  const vaults = await getPagedList(`lista-lending/vaults-${chain}`, VAULT_PAGE_SIZE, (page) => vaultListUrl(chain, page));
  // Offset pagination over a `depositsUsd` sort can hand back the same vault on two pages if a
  // deposit reorders the list mid-walk, and a duplicate would count that vault's management fee
  // twice. The market walk is already immune — it keys by relayer into a Set.
  return [...new Set(vaults.map((v: any) => v.address))];
};

// Fixed-term markets are priced off-market: their IRM returns a zero borrow rate, so Moolah never
// emits `AccrueInterest` for them and the market layer above sees nothing. Borrowers hold the
// position at Moolah at 0% and pay their fixed interest to a per-market broker contract, which a
// fixed-term market stores in its `oracle` slot. On repayment the broker hands that interest to its
// InterestRelayer, which skims the protocol fee and supplies the rest to the MoolahVault.
// The relayer set is resolved from the live market list rather than hardcoded, so a newly launched
// loan token cannot silently drop out of the numbers. The ceiling of reading it from the API is that
// a refill sees today's inventory: were Lista ever to drop a matured market from the list instead of
// leaving it at `status: 2`, its relayer would disappear from later refills of past days. Moolah's
// `CreateMarket` logs would be immune to that, at the cost of a full-history log scan.
type FixedTermRelayer = { relayer: string; brokers: Set<string> };

const getFixedTermRelayers = async (chain: string, api: FetchOptions["api"]): Promise<FixedTermRelayer[]> => {
  const markets = await getPagedList("lista-lending/markets", MARKET_PAGE_SIZE, marketListUrl);
  const ids = markets
    .filter((m: any) => m.chain === API_CHAIN[chain] && m.isFixedTerm)
    .map((m: any) => m.marketId)
    .filter(Boolean);
  if (!ids.length) return [];
  const params = await api.multiCall({
    abi: abis.idToMarketParams,
    calls: ids.map((id: string) => ({ target: MOOLAH[chain], params: [id] })),
  });
  // Three BSC markets (slisBNB/lisUSD, WBNB/lisUSD, BTCB/lisUSD) are genuine fixed-term markets that
  // have no broker wired up yet: their `oracle` is still the plain price oracle
  // 0xf3afD82A4071f272F403dC176916141f44E6c750, so there is nothing to read. They are a known
  // coverage gap, not mislabelled data — when Lista deploys their brokers they join on their own.
  // `BROKER_NAME` is what tells a broker apart from a price oracle, which lets `RELAYER` run without
  // permitFailure: once a contract is known to be a broker, a missing relayer is a real failure and
  // has to throw rather than quietly drop that relayer's whole fee history.
  const brokerNames = await api.multiCall({ abi: "string:BROKER_NAME", calls: params.map((p: any) => p.oracle), permitFailure: true });
  // `!= null` rather than truthiness: an empty name is a broker that answered, and dropping it would
  // be the same silent omission this layer exists to remove.
  const brokers = params.filter((_: any, i: number) => brokerNames[i] != null).map((p: any) => p.oracle);
  if (!brokers.length) return [];
  const relayers = await api.multiCall({ abi: "address:RELAYER", calls: brokers });
  const byRelayer: Record<string, FixedTermRelayer> = {};
  relayers.forEach((relayer: string, i: number) => {
    // `RELAYER` is storage with a one-time setter, so a broker read at a block between its proxy
    // upgrade and that migration answers 0x0 instead of reverting. Name it here rather than letting
    // it surface later as an opaque decode failure that takes the whole chain's fetch down.
    if (!relayer || /^0x0+$/i.test(relayer)) throw new Error(`Lista broker ${brokers[i]} has no relayer set`);
    const key = relayer.toLowerCase();
    (byRelayer[key] ??= { relayer: key, brokers: new Set() }).brokers.add(brokers[i].toLowerCase());
  });
  return Object.values(byRelayer);
};

const fetch = async (options: FetchOptions) => {
  const { chain, api } = options;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // ---- Market layer: total borrow interest + market protocol fee ----
  const interestLogs = await options.getLogs({ target: MOOLAH[chain], eventAbi: abis.AccrueInterest });

  const marketIds = [...new Set(interestLogs.map((log: any) => String(log.id)))];
  const loanToken: Record<string, string> = {};
  const marketFeeRate: Record<string, bigint> = {};
  if (marketIds.length) {
    const [params, markets] = await Promise.all([
      api.multiCall({ abi: abis.idToMarketParams, calls: marketIds.map((id) => ({ target: MOOLAH[chain], params: [id] })) }),
      api.multiCall({ abi: abis.market, calls: marketIds.map((id) => ({ target: MOOLAH[chain], params: [id] })) }),
    ]);
    marketIds.forEach((id, i) => {
      loanToken[id] = params[i].loanToken;
      marketFeeRate[id] = BigInt(markets[i].fee);
    });
  }

  for (const log of interestLogs) {
    const id = String(log.id);
    const token = loanToken[id];
    if (!token) continue;
    const interest = BigInt(log.interest);
    const marketFee = (interest * marketFeeRate[id]) / WAD;
    dailyFees.add(token, interest, METRIC.BORROW_INTEREST);
    dailyRevenue.add(token, marketFee, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.add(token, interest - marketFee, METRIC.BORROW_INTEREST);
  }

  // ---- Vault layer: MoolahVault management fee (Lista-operated vaults only) ----
  const vaults = await getVaultAddresses(chain);
  if (vaults.length) {
    const feeRecipients = await api.multiCall({ abi: "address:feeRecipient", calls: vaults, permitFailure: true });
    const listaVaults = vaults.filter(
      (_, i) => feeRecipients[i]?.toLowerCase() === LENDING_FEE_RECIPIENT[chain].toLowerCase()
    );

    if (listaVaults.length) {
      const vaultLogs = await options.getLogs({ targets: listaVaults, eventAbi: abis.VaultAccrueInterest, flatten: false });
      const feeShares = listaVaults.map((_, i) =>
        (vaultLogs[i] ?? []).reduce((sum: bigint, log: any) => sum + BigInt(log.feeShares), 0n)
      );
      const [assets, tokens] = await Promise.all([
        api.multiCall({
          abi: "function convertToAssets(uint256) view returns (uint256)",
          calls: listaVaults.map((v, i) => ({ target: v, params: [feeShares[i].toString()] })),
          permitFailure: true,
        }),
        api.multiCall({ abi: "address:asset", calls: listaVaults, permitFailure: true }),
      ]);
      listaVaults.forEach((_, i) => {
        const feeAssets = assets[i] ? BigInt(assets[i]) : 0n;
        if (feeAssets > 0n && tokens[i]) {
          // Vault management fee is Lista revenue carved out of the market supply side.
          dailyRevenue.add(tokens[i], feeAssets, METRIC.MANAGEMENT_FEES);
          dailySupplySideRevenue.subtractToken(tokens[i], feeAssets, METRIC.BORROW_INTEREST);
        }
      });
    }
  }

  // ---- Fixed-term layer: interest collected by the broker InterestRelayers ----
  // Gross interest is the loan token a broker hands to its relayer: `supplyToVault` pulls exactly
  // the amount being settled, which the relayer's own source calls "incoming revenue (interest +
  // penalty)" — borrower-paid either way, so all of it is Fees. The protocol's cut of it is
  // `ProtocolFeeCharged`. Both legs are read directly so the split survives a fee-rate change:
  // deriving one from the other through `feeRate` would misattribute any window the rate moved in,
  // and would report zero fees outright if the rate were ever set to 0 — the same silent-zero this
  // fix exists to remove. The fee is booked as protocol revenue whoever `feeRecipient` is; today it
  // is the treasury on both chains (BSC 0x34B504A5CF0fF41F8A480580533b6Dda687fa3Da, Ethereum
  // 0x0fe5741e8dFe53618c4056F745fad531118640D9), and it is a cut Lista takes out of supplier
  // interest regardless of where it is forwarded.
  // `InterestAccumulated` is not usable for either leg: it reports the relayer balance left *after*
  // the fee and is re-emitted unchanged whenever that balance stays below `minLoan`, so summing it
  // double counts.
  const relayers = await getFixedTermRelayers(chain, api);
  if (relayers.length) {
    const relayerTokens = await api.multiCall({ abi: "address:token", calls: relayers.map((r) => r.relayer) });
    const [feeLogs, interestLogsPerRelayer] = await Promise.all([
      options.getLogs({ targets: relayers.map((r) => r.relayer), eventAbi: abis.ProtocolFeeCharged, flatten: false }),
      Promise.all(
        relayers.map((r, i) =>
          options.getLogs({
            target: relayerTokens[i],
            eventAbi: abis.Transfer,
            topics: [TRANSFER_TOPIC, null as any, ethers.zeroPadValue(r.relayer, 32)],
          })
        )
      ),
    ]);
    relayers.forEach((r, i) => {
      // Both legs are filtered to the same broker set. Only brokers can move interest in, so on the
      // transfer side this rejects donations; on the fee side it keeps the two legs symmetric — a
      // relayer is shared by up to eight brokers, and counting a broker's fee without its interest
      // would push that relayer's supply side negative.
      const interest = interestLogsPerRelayer[i]
        .filter((log: any) => r.brokers.has(String(log.from).toLowerCase()))
        .reduce((sum: bigint, log: any) => sum + BigInt(log.value), 0n);
      if (!interest) return;
      const fee = (feeLogs[i] ?? [])
        .filter((log: any) => r.brokers.has(String(log.broker).toLowerCase()))
        .reduce((sum: bigint, log: any) => sum + BigInt(log.fee), 0n);
      dailyFees.add(relayerTokens[i], interest, METRIC.BORROW_INTEREST);
      dailyRevenue.add(relayerTokens[i], fee, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.add(relayerTokens[i], interest - fee, METRIC.BORROW_INTEREST);
    });
  }

  // At this point dailyRevenue is Lista's protocol cut only -> ProtocolRevenue.
  const dailyProtocolRevenue = dailyRevenue.clone();

  // ---- DAO lending-position yield: reclassify from supply-side to protocol revenue ----
  const moolahVaultAccount = MOOLAH_VAULT_ACCOUNT[chain];
  if (moolahVaultAccount) {
    const daoYieldToTreasury = options.createBalances();
    await addTokensReceived({
      options,
      target: DAO_YIELD_RECIPIENT_BSC,
      fromAddressFilter: moolahVaultAccount,
      tokens: [LISUSD_BSC],
      balances: daoYieldToTreasury,
    });
    // The DAO's own position yield kept by the protocol -> ProtocolRevenue; remove it from the
    // supply side. It is not a LISTA buy-back, so it is NOT holders revenue. Fees stay the same.
    dailyRevenue.addBalances(daoYieldToTreasury, METRIC.BORROW_INTEREST);
    dailyProtocolRevenue.addBalances(daoYieldToTreasury, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.addBalances(daoYieldToTreasury.clone(-1), METRIC.BORROW_INTEREST);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total borrow interest paid by borrowers across all Moolah markets, including the fixed interest (and late penalties) paid on fixed-term markets.",
  Revenue: "Lista's protocol cut (market protocol fee + MoolahVault management fee + the fixed-term InterestRelayer fee) plus the DAO's own MoolahVault position yield that the protocol keeps as revenue.",
  ProtocolRevenue: "Market protocol fee (interest × market fee), the fee the fixed-term InterestRelayers skim off the fixed interest before it reaches suppliers, the management fee on self-operated MoolahVaults, and the DAO's own MoolahVault position yield kept by the protocol (routed to the treasury as USDT, not a LISTA buy-back).",
  SupplySideRevenue: "Borrow interest (variable and fixed-term) distributed to third-party suppliers/lenders, net of Lista's protocol cut and net of the DAO's own position yield reclassified to protocol revenue.",
};

const breakdownMethodology = {
  Fees: { [METRIC.BORROW_INTEREST]: "Total interest paid by borrowers across all Moolah markets, variable-rate and fixed-term." },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "Market protocol fee (interest × market fee), the fixed-term InterestRelayer fee, plus the DAO's own MoolahVault position yield kept by the protocol.",
    [METRIC.MANAGEMENT_FEES]: "Management fee on self-operated MoolahVaults (feeRecipient = Lista's LendingFeeRecipient).",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: "Market protocol fee (interest × market fee), the fixed-term InterestRelayer fee, plus the DAO's own MoolahVault position yield kept by the protocol.",
    [METRIC.MANAGEMENT_FEES]: "Management fee on self-operated MoolahVaults.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Interest to third-party suppliers/lenders, net of the market fee, the fixed-term InterestRelayer fee, the vault management fee, and the DAO's own position yield reclassified to protocol revenue.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // A DAO yield claim realises position yield accrued over many prior days, so on a claim day the
  // reclassified amount can exceed that window's supplier interest and push SupplySideRevenue negative.
  // This is expected lumpiness that nets out cumulatively — keep such days rather than throwing.
  // Fixed-term interest is lumpy for a related reason: a term loan's whole interest settles on the
  // day it is repaid, so those days spike. That one only ever adds, so it cannot go negative.
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BSC]: { fetch, start: "2025-04-16" },
    // Lista Lending launched on Ethereum later.
    [CHAIN.ETHEREUM]: { fetch, start: "2025-10-02" },
  },
};

export default adapter;
