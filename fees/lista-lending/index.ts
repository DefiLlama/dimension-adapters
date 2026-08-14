import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

/**
 * Lista Lending (Moolah) protocol revenue.
 *
 * All lending fees are collected via LendingFeeRecipient, which forwards them to two downstream
 * receivers (read on-chain):
 *   - vault management fee (10% of vault yield) -> `vaultFeeRecipient`  (LendingRevenueDistributor)
 *   - market protocol fee  (% of borrow interest) -> `marketFeeRecipient` (shared treasury / ListaRevenueDistributor)
 *
 * Revenue = tokens received by those receivers. The market receiver is a shared treasury that also
 * collects CDP stability fees and other income, so the market fee is isolated by only counting
 * transfers that come straight from the Moolah lending contract.
 *
 * This is claim/settlement-timed: fees are booked when the bot claims & forwards them (unclaimed
 * fees are simply counted later, when claimed), so cumulative totals are exact even though any
 * single day can be lumpy. Contract team confirmed counting via these receivers is correct.
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

const fetch = async (options: FetchOptions) => {
  const { chain } = options;
  const lfr = LENDING_FEE_RECIPIENT[chain];
  const dailyRevenue = options.createBalances();

  // Fee destinations are configurable on-chain; read them live instead of hardcoding.
  const [marketFeeRecipient, vaultFeeRecipient] = await Promise.all([
    options.api.call({ target: lfr, abi: "address:marketFeeRecipient" }),
    options.api.call({ target: lfr, abi: "address:vaultFeeRecipient" }),
  ]);

  // Vault management fee: the vault fee recipient is a lending-only distributor, so count all inflows.
  await addTokensReceived({ options, target: vaultFeeRecipient, balances: dailyRevenue });

  // Market protocol fee: the market fee recipient is a shared treasury (also receives CDP / other
  // income), so only count transfers coming straight from the Moolah lending contract. When both
  // receivers are the same address (e.g. Ethereum), the inflow above already captured it.
  if (vaultFeeRecipient.toLowerCase() !== marketFeeRecipient.toLowerCase()) {
    await addTokensReceived({
      options,
      target: marketFeeRecipient,
      fromAddressFilter: MOOLAH[chain],
      balances: dailyRevenue,
    });
  }

  return {
    dailyFees: dailyRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Lending fees collected by Lista DAO: the market protocol fee (a % of borrow interest) plus the 10% management fee on self-operated MoolahVaults.",
  Revenue: "Same as Fees — all lending fees accrue to Lista DAO via LendingFeeRecipient's downstream receivers.",
  ProtocolRevenue: "Same as Revenue — all lending fees are collected by Lista DAO.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.BSC]: { fetch, start: "2025-04-16" },
    // Lista Lending launched on Ethereum later.
    [CHAIN.ETHEREUM]: { fetch, start: "2025-10-02" },
  },
};

export default adapter;
