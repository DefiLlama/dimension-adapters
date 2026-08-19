import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getConfig } from "../../helpers/cache";

/**
 * Lista Lending (Moolah) — a Morpho-Blue fork on BSC and Ethereum.
 *
 * Fees / SupplySide / Revenue are derived from on-chain interest accrual (same shape as the
 * canonical Morpho adapter), so the full borrow interest — including the yield earned by
 * suppliers/lenders — is captured, not only Lista's protocol cut:
 *
 *   - Fees              = total borrow interest across all markets (Moolah `AccrueInterest.interest`).
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
const PAGE_SIZE = 100;
const vaultListUrl = (chain: string, page: number) =>
  `https://api.lista.org/api/moolah/vault/list?page=${page}&pageSize=${PAGE_SIZE}&sort=depositsUsd&order=desc&chain=${API_CHAIN[chain]}`;

const abis = {
  AccrueInterest:
    "event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)",
  idToMarketParams:
    "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  market:
    "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  VaultAccrueInterest: "event AccrueInterest(uint256 newTotalAssets, uint256 feeShares)",
};

// Paginate the full vault inventory; throw (rather than silently under-report) if the API/cache
// returns an invalid response.
const getVaultAddresses = async (chain: string): Promise<string[]> => {
  const addresses: string[] = [];
  let page = 1;
  let total = Infinity;
  while (addresses.length < total) {
    const res = await getConfig(`lista-lending/vaults-${chain}-${page}`, vaultListUrl(chain, page));
    const list = res?.data?.list;
    if (!Array.isArray(list)) throw new Error(`Lista vault list unavailable for ${chain}`);
    total = Number(res.data.total ?? list.length);
    addresses.push(...list.map((v: any) => v.address));
    if (list.length === 0) break;
    page++;
  }
  return addresses;
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

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total borrow interest paid by borrowers across all Moolah markets.",
  Revenue: "Lista's protocol cut: the market protocol fee (interest × market fee) plus the management fee on self-operated MoolahVaults.",
  ProtocolRevenue: "Same as Revenue — all lending fees are collected by Lista DAO.",
  SupplySideRevenue: "Borrow interest distributed to suppliers/lenders, net of Lista's protocol cut.",
};

const breakdownMethodology = {
  Fees: { [METRIC.BORROW_INTEREST]: "Total interest paid by borrowers across all Moolah markets." },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "Market protocol fee = interest × market fee.",
    [METRIC.MANAGEMENT_FEES]: "Management fee on self-operated MoolahVaults (feeRecipient = Lista's LendingFeeRecipient).",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: "Market protocol fee = interest × market fee.",
    [METRIC.MANAGEMENT_FEES]: "Management fee on self-operated MoolahVaults.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Interest to suppliers/lenders, net of the market fee and vault management fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BSC]: { fetch, start: "2025-04-16" },
    // Lista Lending launched on Ethereum later.
    [CHAIN.ETHEREUM]: { fetch, start: "2025-10-02" },
  },
};

export default adapter;
