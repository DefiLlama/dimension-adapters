import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Hyperbeat Operator contract on HyperEVM (Hyperbeat Liquid Bank). It batches card
// spend settlements (debit) and Morpho borrows (credit) across user ManagementAccounts.
// Source: Hyperbeat Operator contract; docs https://docs.hyperbeat.org
const OPERATOR = "0xfc29c43238e0702ab59809d5255ac3970beaf51d";

// beatUSD (Hyperbeat USD): treasury-backed, $1-pegged, 6 decimals. Total supply
// equals the cash balances held across all Hyperbeat accounts.
// Source: read from Operator.settlementToken(); https://hyperevmscan.io/address/0x669abe85F96a9e3B34723F7Be9bC6F250aBC0Cc1
const BEAT_USD = "0x669abe85F96a9e3B34723F7Be9bC6F250aBC0Cc1";

// In both events `amount` is the only non-indexed field, so it lives in log data.
const SETTLEMENT_EVENT =
  "event SettlementSuccess(address indexed account, address indexed token, uint256 amount, uint256 indexed batchIndex)";
const BORROW_EVENT =
  "event BorrowSuccess(address indexed account, bytes32 indexed marketId, uint256 amount, uint256 indexed batchIndex)";

const SETTLEMENT_DECIMALS = 1e6; // beatUSD, $1-pegged
// Rates provided by the Hyperbeat team (Liquid Bank card program); see https://docs.hyperbeat.org
const INTERCHANGE_RATE = 0.0118; // 1.18% interchange on card spend (debit + credit)
const TREASURY_APR = 0.035; // 3.5% annualized treasury yield earned on beatUSD reserves
const YEAR = 365 * 24 * 60 * 60;

const INTERCHANGE = "Card Interchange";
const TREASURY_YIELD = "Treasury Yield";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances, api } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const [settlements, borrows, supply] = await Promise.all([
    getLogs({ target: OPERATOR, eventAbi: SETTLEMENT_EVENT }),
    getLogs({ target: OPERATOR, eventAbi: BORROW_EVENT }),
    api.call({ target: BEAT_USD, abi: "uint256:totalSupply" }),
  ]);

  // Card spend volume (debit + credit) and the 1.18% interchange Hyperbeat earns on it.
  let spendUsd = 0;
  for (const log of settlements) spendUsd += Number(log.amount) / SETTLEMENT_DECIMALS;
  for (const log of borrows) spendUsd += Number(log.amount) / SETTLEMENT_DECIMALS;
  dailyVolume.addUSDValue(spendUsd);
  dailyFees.addUSDValue(spendUsd * INTERCHANGE_RATE, INTERCHANGE);

  // Treasury yield accrued on all beatUSD balances over the period. beatUSD is a
  // flat $1 token (yield accrues off-chain at the treasury), so it is derived
  // from the on-chain supply and a fixed APR. Hyperbeat keeps 100%.
  const supplyUsd = Number(supply) / SETTLEMENT_DECIMALS;
  const yieldUsd = (supplyUsd * TREASURY_APR * (options.toTimestamp - options.fromTimestamp)) / YEAR;
  dailyFees.addUSDValue(yieldUsd, TREASURY_YIELD);

  // 100% of both interchange and treasury yield is kept by Hyperbeat. beatUSD is a
  // non-yield-bearing stablecoin (holders don't receive the treasury yield), so there is
  // no supply-side; we return 0 to make the income-statement balance explicit
  // (dailyFees = dailyRevenue + dailySupplySideRevenue).
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: createBalances(),
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Total card spend settled through the Hyperbeat Operator contract, covering both debit (SettlementSuccess) and credit/borrow (BorrowSuccess) spend.",
    Fees: "1.18% interchange on card spend plus 3.5% annualized treasury yield earned on all beatUSD balances.",
    Revenue: "Card interchange and treasury yield earned by Hyperbeat.",
    ProtocolRevenue: "Card interchange and treasury yield earned by Hyperbeat.",
  },
  breakdownMethodology: {
    Fees: {
      [INTERCHANGE]: "1.18% interchange revenue on total card spend (debit + credit).",
      [TREASURY_YIELD]: "3.5% annualized treasury yield accrued on the total beatUSD supply (user account balances).",
    },
    Revenue: {
      [INTERCHANGE]: "Interchange revenue earned by Hyperbeat on total card spend (debit + credit).",
      [TREASURY_YIELD]: "Treasury yield earned on the total beatUSD supply (user account balances).",
    },
  },
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-11-11",
};

export default adapter;
