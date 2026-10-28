import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// https://docs.soroswap.finance
// https://docs.soroswap.finance/additional-resources/01-concepts/01-fees
const FEE_RATE = 0.003;
const FACTORY = "CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Swap events come from every SoroswapPair contract (topics ["SoroswapPair", "swap"]).
  // stellar.history_contract_events stores some contract events twice (with and without
  // operation_id), so events are deduplicated on their XDR within each transaction.
  // A pair's token_0/token_1 are read from its instance storage (keys 0 and 1), which is
  // rewritten on every swap because reserves live there too, so the same day partition has
  // it. Key 4 must be the Soroswap factory, which drops contracts that only mimic the topic.
  const query = `
    WITH events AS (
      SELECT DISTINCT transaction_hash, contract_id, contract_event_xdr, data_decoded
      FROM stellar.history_contract_events
      WHERE closed_at_date = DATE '${options.dateString}'
        AND type_string = 'ContractEventTypeContract'
        AND successful = true
        AND in_successful_contract_call = true
        AND topics_decoded LIKE '%"string":"SoroswapPair"%'
        AND topics_decoded LIKE '%"symbol":"swap"%'
    ),
    swaps AS (
      SELECT
        contract_id AS pair,
        SUM(TRY_CAST(regexp_extract(data_decoded, '"amount_0_in"\\},"val":\\{"i128":"([0-9]+)"\\}', 1) AS DECIMAL(38,0))) AS amount_0_in,
        SUM(TRY_CAST(regexp_extract(data_decoded, '"amount_1_in"\\},"val":\\{"i128":"([0-9]+)"\\}', 1) AS DECIMAL(38,0))) AS amount_1_in
      FROM events
      GROUP BY 1
    ),
    pairs AS (
      SELECT
        contract_id AS pair,
        MAX(regexp_extract(val_decoded, '\\{"key":\\{"u32":0\\},"val":\\{"address":"([A-Z0-9]+)"\\}', 1)) AS token_0,
        MAX(regexp_extract(val_decoded, '\\{"key":\\{"u32":1\\},"val":\\{"address":"([A-Z0-9]+)"\\}', 1)) AS token_1
      FROM stellar.contract_data
      WHERE closed_at_date = DATE '${options.dateString}'
        AND contract_key_type = 'ScValTypeScvLedgerKeyContractInstance'
        AND contract_id IN (SELECT pair FROM swaps)
        AND val_decoded LIKE '%{"key":{"u32":4},"val":{"address":"${FACTORY}"}}%'
      GROUP BY 1
    ),
    volumes AS (
      SELECT p.token_0 AS token, s.amount_0_in AS amount FROM swaps s JOIN pairs p ON s.pair = p.pair
      UNION ALL
      SELECT p.token_1 AS token, s.amount_1_in AS amount FROM swaps s JOIN pairs p ON s.pair = p.pair
    )
    SELECT token, CAST(SUM(amount) AS VARCHAR) AS amount
    FROM volumes
    WHERE token IS NOT NULL AND amount > 0
    GROUP BY 1
  `;

  const rows: { token: string; amount: string }[] = await queryDuneSql(options, query);

  rows.forEach(({ token, amount }) => {
    if (token && amount) dailyVolume.add(token, amount);
  });

  const dailyFees = dailyVolume.clone(FEE_RATE, METRIC.SWAP_FEES);
  const dailySupplySideRevenue = dailyVolume.clone(FEE_RATE, METRIC.LP_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Volume: "Sum of the input amounts (amount_0_in, amount_1_in) of every swap event emitted by Soroswap pairs created by the SoroswapFactory, read from raw Stellar contract events.",
  Fees: "0.3% fee charged on every swap.",
  UserFees: "Traders pay 0.3% fee on each swap.",
  SupplySideRevenue: "All swap fees (0.3%) are distributed to liquidity providers.",
  Revenue: "Soroswap does not take any protocol fee; all fees go to LPs.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.3% fee charged on every swap.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "All swap fees (0.3%) are distributed to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STELLAR],
  start: "2024-03-11",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
