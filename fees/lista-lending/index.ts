import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

/**
 * Lista Lending (Moolah) — a Morpho-Blue fork on BSC and Ethereum.
 *
 * Fees / SupplySide / Revenue are derived from on-chain interest accrual (same shape as the
 * canonical `fees/morpho` adapter), so the full borrow interest — including the yield earned by
 * suppliers/lenders — is captured, not only Lista's protocol cut:
 *
 *   - Fees              = total borrow interest across all markets (Moolah `AccrueInterest.interest`).
 *   - Revenue           = Lista's market protocol fee = interest × market fee.
 *   - SupplySideRevenue = Fees − Revenue = interest distributed to suppliers/lenders.
 *
 * Scope note: this tracks the Moolah lending *markets*. The separate MoolahVault management fee
 * (a MetaMorpho-style vault layer, like Morpho vs MetaMorpho on DefiLlama) is out of scope here.
 *
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-lending
 */

const WAD = 10n ** 18n;

const MOOLAH: Record<string, string> = {
  [CHAIN.BSC]: "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C",
  [CHAIN.ETHEREUM]: "0xf820fB4680712CD7263a0D3D024D5b5aEA82Fd70",
};

const abis = {
  AccrueInterest:
    "event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)",
  // idToMarketParams is immutable per market id.
  idToMarketParams:
    "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  // market().fee is the protocol fee rate (WAD). Read per fetch window; it is effectively constant
  // within a day and changes only via rare governance SetFee calls.
  market:
    "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
};

const fetch = async (options: FetchOptions) => {
  const { chain, api } = options;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({ target: MOOLAH[chain], eventAbi: abis.AccrueInterest });

  const marketIds = [...new Set(logs.map((log: any) => String(log.id)))];
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

  for (const log of logs) {
    const id = String(log.id);
    const token = loanToken[id];
    if (!token) continue;
    const interest = BigInt(log.interest);
    const marketFee = (interest * marketFeeRate[id]) / WAD;
    dailyFees.add(token, interest, METRIC.BORROW_INTEREST);
    dailyRevenue.add(token, marketFee, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.add(token, interest - marketFee, METRIC.BORROW_INTEREST);
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
  Revenue: "Lista's market protocol fee = borrow interest × the market fee rate.",
  ProtocolRevenue: "Same as Revenue — the market protocol fee is collected by Lista DAO.",
  SupplySideRevenue: "Borrow interest distributed to suppliers/lenders, net of the market protocol fee.",
};

const breakdownMethodology = {
  Fees: { [METRIC.BORROW_INTEREST]: "Total interest paid by borrowers across all Moolah markets." },
  Revenue: { [METRIC.BORROW_INTEREST]: "Market protocol fee = borrow interest × market fee rate." },
  ProtocolRevenue: { [METRIC.BORROW_INTEREST]: "Market protocol fee = borrow interest × market fee rate." },
  SupplySideRevenue: { [METRIC.BORROW_INTEREST]: "Interest distributed to suppliers/lenders, net of the market fee." },
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
