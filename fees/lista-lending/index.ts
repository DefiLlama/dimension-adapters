import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

/**
 * Lista Lending (Moolah) protocol revenue.
 *
 * All lending fees are collected via LendingFeeRecipient, which forwards them to two downstream
 * receivers:
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

// Moolah lending contract (source of the market protocol-fee transfers).
const MOOLAH: Record<string, string> = {
  [CHAIN.BSC]: "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C",
  [CHAIN.ETHEREUM]: "0xf820fB4680712CD7263a0D3D024D5b5aEA82Fd70",
};
// Downstream fee receivers, read on-chain from LendingFeeRecipient.{market,vault}FeeRecipient().
// Hardcoded here (they are set-once config) so the adapter only makes indexed getLogs calls — a
// live eth_call for these at the window's end block fails on pruned public RPCs ("missing trie node").
const MARKET_FEE_RECIPIENT: Record<string, string> = {
  [CHAIN.BSC]: "0x34B504A5CF0fF41F8A480580533b6Dda687fa3Da",
  [CHAIN.ETHEREUM]: "0x0fe5741e8dFe53618c4056F745fad531118640D9",
};
const VAULT_FEE_RECIPIENT: Record<string, string> = {
  [CHAIN.BSC]: "0xea55952a51ddd771d6eBc45Bd0B512276dd0b866",
  [CHAIN.ETHEREUM]: "0xd10a024602E042dcb9C19e21682c3b896c8B0d30",
};

const VAULT_MANAGEMENT_FEE = "Vault Management Fee";
const MARKET_PROTOCOL_FEE = "Market Protocol Fee";

const fetch = async (options: FetchOptions) => {
  const { chain } = options;
  const dailyRevenue = options.createBalances();

  // Vault management fee: the vault fee recipient is a lending-only distributor, so count all inflows.
  const vaultFees = options.createBalances();
  await addTokensReceived({ options, target: VAULT_FEE_RECIPIENT[chain], balances: vaultFees });
  dailyRevenue.addBalances(vaultFees, VAULT_MANAGEMENT_FEE);

  // Market protocol fee: the market fee recipient is a shared treasury (BSC also routes CDP stability
  // fees here), so only count transfers coming straight from the Moolah lending contract.
  const marketFees = options.createBalances();
  await addTokensReceived({
    options,
    target: MARKET_FEE_RECIPIENT[chain],
    fromAddressFilter: MOOLAH[chain],
    balances: marketFees,
  });
  dailyRevenue.addBalances(marketFees, MARKET_PROTOCOL_FEE);

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

const breakdownMethodology = {
  [VAULT_MANAGEMENT_FEE]: "10% management fee on self-operated MoolahVaults, received by the vault fee recipient (LendingRevenueDistributor).",
  [MARKET_PROTOCOL_FEE]: "Protocol fee on Moolah market borrow interest, received straight from the Moolah lending contract by the market fee recipient.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology: {
    Fees: breakdownMethodology,
    Revenue: breakdownMethodology,
    ProtocolRevenue: breakdownMethodology,
  },
  adapter: {
    [CHAIN.BSC]: { fetch, start: "2025-04-16" },
    // Lista Lending launched on Ethereum later.
    [CHAIN.ETHEREUM]: { fetch, start: "2025-10-02" },
  },
};

export default adapter;
