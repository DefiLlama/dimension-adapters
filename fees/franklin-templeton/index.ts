import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryDuneSql } from "../../helpers/dune";

const GROSS_EXPENSE_YEAR = 0.0022;
const EVM_BENJI_DECIMALS = 18;

// Source: Franklin Templeton FOBXX distributions; 0.22% gross expense ratio applied across BENJI chains.
const chainConfig: any = {
  [CHAIN.ETHEREUM]: {
    start: "2025-01-01",
    tokens: [
      "0x3DDc84940Ab509C11B20B76B466933f40b750dc9",
      "0x90276e9d4A023b5229E0C2e9D4b2a83fe3A2b48c",
    ],
  },
  [CHAIN.POLYGON]: {
    start: "2023-10-04",
    tokens: ["0x408a634b8a8f0de729b48574a3a7ec3fe820b00a"],
  },
  [CHAIN.ARBITRUM]: {
    start: "2025-01-01",
    tokens: ["0xB9e4765BCE2609bC1949592059B17Ea72fEe6C6A"],
  },
  [CHAIN.AVAX]: {
    start: "2025-01-01",
    tokens: ["0xE08b4c1005603427420e64252a8b120cacE4D122"],
  },
  [CHAIN.BASE]: {
    start: "2025-01-01",
    tokens: ["0x60CfC2b186a4CF647486e42c42B11cC6D571d1E4"],
  },
  [CHAIN.APTOS]: {
    start: "2026-05-01",
    tokens:
      "0x7b5e9cac3433e9202f28527f707c89e1e47b19de2c33e4db9521a63ad219b739",
    decimals: 9,
  },
  [CHAIN.SOLANA]: {
    start: "2026-05-01",
    tokens: "5Tu84fKBpe9vfXeotjvfvWdWbAjy3hqsExvuHgFqFxA1",
    decimals: 9,
  },
  [CHAIN.BSC]: {
    start: "2025-01-01",
    tokens: ["0x3d0a2A3a30a43a2C1C4b92033609245E819ae6a6"],
  },
  [CHAIN.STELLAR]: {
    start: "2023-10-04",
    issuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
    tokens: "BENJI",
  },
};

const managementFees = (supply: number, periodSeconds: number) =>
  (supply * GROSS_EXPENSE_YEAR * periodSeconds) / (365 * 86400);

const formatData = (row: any, options: any, yieldKey = "daily_dividends") => {
  const supply = Number(row?.supply ?? 0);
  return {
    assetYields: Number(row?.[yieldKey] ?? 0),
    managementFees: managementFees(
      supply,
      options.endTimestamp - options.startTimestamp,
    ),
  };
};

const stellarData = async (options: any) => {
  const { issuer, tokens: assetCode } = chainConfig[CHAIN.STELLAR];
  const query = `
    with latest_trust_lines as (
      select
        ledger_key,
        max_by(balance, closed_at) as balance,
        max_by(deleted, closed_at) as deleted
      from stellar.trust_lines
      where closed_at < from_unixtime(${options.endTimestamp})
        and asset_code = '${assetCode}'
        and asset_issuer = '${issuer}'
      group by 1
    ),
    dividends as (
      select
        sum(o.amount) as daily_dividends
      from stellar.history_operations o
      join stellar.history_transactions t
        on o.transaction_id = t.id
      where o.closed_at >= from_unixtime(${options.startTimestamp})
        and o.closed_at < from_unixtime(${options.endTimestamp})
        and o.asset_code = '${assetCode}'
        and o.asset_issuer = '${issuer}'
        and o.type_string = 'payment'
        and o."from" = '${issuer}'
        and t.memo like 'DIVR %'
    )
    select
      coalesce((select sum(balance) from latest_trust_lines where not deleted), 0) as supply,
      coalesce((select daily_dividends from dividends), 0) as daily_dividends
  `;

  const queryResults = await queryDuneSql(options, query);
  return formatData(queryResults[0], options);
};

const aptosData = async (options: any) => {
  const { decimals, tokens: metadata } = chainConfig[CHAIN.APTOS];
  const divisor = 10 ** decimals;
  const query = `
    with latest_supply as (
      select
        max_by(json_extract_scalar(move_data, '$.current.value'), block_time) as supply
      from aptos.move_resources
      where block_time < from_unixtime(${options.endTimestamp})
        and move_address = ${metadata}
        and move_resource_module = 'fungible_asset'
        and move_resource_name = 'ConcurrentSupply'
    ),
    dividends as (
      select
        sum(cast(json_extract_scalar(data, '$.shares') as double)) as daily_dividends
      from aptos.events
      where block_time >= from_unixtime(${options.startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
        and event_type = '0xe10898758351ac7d32835ca8f7ef75a31232d210a1ba9cb628f85aef8a6f8eb6::fund_token::DividendDistributedEvent'
    )
    select
      coalesce(cast((select supply from latest_supply) as double), 0) / ${divisor} as supply,
      coalesce((select daily_dividends from dividends), 0) / ${divisor} as daily_dividends
  `;

  const queryResults = await queryDuneSql(options, query);
  return formatData(queryResults[0], options);
};

const evmData = async (options: any, tokens: string[]) => {
  const tokenValues = tokens
    .map((token) => `(${token})`)
    .join(",\n        ");

  const query = `
    with tokens(contract_address) as (
      values
        ${tokenValues}
    ),
    chain_logs as (
      select
        l.block_time,
        l.tx_hash,
        l.contract_address,
        l.topic0,
        l.topic1,
        l.topic2,
        l.data
      from CHAIN.logs l
      where l.block_time < from_unixtime(${options.endTimestamp})
        and (
          l.topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
          or l.topic0 = 0xe0b019f23e4f4948c15bdd9dfa8808b046568a2fda0f2978492dcc284fb79c9a
        )
    ),
    supply_transfers as (
      select
        sum(
          case
            when l.topic1 = 0x0000000000000000000000000000000000000000000000000000000000000000 then cast(bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) as double)
            when l.topic2 = 0x0000000000000000000000000000000000000000000000000000000000000000 then -cast(bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) as double)
            else 0
          end
        ) / 1e${EVM_BENJI_DECIMALS} as supply
      from chain_logs l
      join tokens t
        on l.contract_address = t.contract_address
      where l.topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
        and (
          l.topic1 = 0x0000000000000000000000000000000000000000000000000000000000000000
          or l.topic2 = 0x0000000000000000000000000000000000000000000000000000000000000000
        )
    ),
    dividend_txs as (
      select distinct
        l.tx_hash
      from chain_logs l
      join tokens t
        on l.contract_address = t.contract_address
      where TIME_RANGE
        and l.topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
        and l.topic1 = 0x0000000000000000000000000000000000000000000000000000000000000000
    ),
    dividends as (
      -- DividendDistributed is emitted by a controller contract, so first anchor on BENJI/iBENJI mint txs.
      select
        case
          when bytearray_to_uint256(bytearray_substring(l.data, 161, 32)) = 1
            then -cast(bytearray_to_uint256(bytearray_substring(l.data, 65, 32)) as double)
          else cast(bytearray_to_uint256(bytearray_substring(l.data, 65, 32)) as double)
        end / 1e${EVM_BENJI_DECIMALS} as shares
      from chain_logs l
      join dividend_txs d
        on l.tx_hash = d.tx_hash
      where TIME_RANGE
        and l.topic0 = 0xe0b019f23e4f4948c15bdd9dfa8808b046568a2fda0f2978492dcc284fb79c9a
    )
    select
      coalesce((select supply from supply_transfers), 0) as supply,
      coalesce(sum(shares), 0) as asset_yields
    from dividends
  `;

  const queryResults = await queryDuneSql(options, query, {
    extraUIDKey: "evm-asset-yields",
  });
  return formatData(queryResults[0], options, "asset_yields");
};

const solanaData = async (options: any) => {
  const { decimals, tokens: mint } = chainConfig[CHAIN.SOLANA];
  const divisor = 10 ** decimals;
  const query = `
    with supply as (
      select
        coalesce(sum(
          case
            when action = 'mint' then amount
            when action = 'burn' then -amount
            else 0
          end
        ), 0) as supply
      from tokens_solana.transfers
      where block_time < from_unixtime(${options.endTimestamp})
        and token_mint_address = '${mint}'
        and action in ('mint', 'burn')
    ),
    dividend_txs as (
      select
        id as tx_id
      from solana.transactions
      where block_time >= from_unixtime(${options.startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
        and contains(log_messages, 'Program log: Instruction: DistributeDividend2')
    ),
    dividends as (
      select
        coalesce(sum(t.amount), 0) as daily_dividends
      from tokens_solana.transfers t
      join dividend_txs d
        on t.tx_id = d.tx_id
      where t.block_time >= from_unixtime(${options.startTimestamp})
        and t.block_time < from_unixtime(${options.endTimestamp})
        and t.token_mint_address = '${mint}'
        and t.action = 'mint'
    )
    select
      coalesce((select supply from supply), 0) / ${divisor} as supply,
      coalesce((select daily_dividends from dividends), 0) / ${divisor} as daily_dividends
  `;

  const queryResults = await queryDuneSql(options, query);
  return formatData(queryResults[0], options);
};

const fetch = async (_timestamp: any, _chainBlocks: any, options: any) => {
  const { api, chain, createBalances } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const data =
    api.chain === CHAIN.STELLAR
      ? await stellarData(options)
      : api.chain === CHAIN.APTOS
        ? await aptosData(options)
        : api.chain === CHAIN.SOLANA
          ? await solanaData(options)
          : await evmData(options, chainConfig[chain].tokens);

  dailyFees.addUSDValue(data.managementFees, METRIC.MANAGEMENT_FEES);
  dailyFees.addUSDValue(data.assetYields, METRIC.ASSETS_YIELDS);

  dailyRevenue.addUSDValue(data.managementFees, METRIC.MANAGEMENT_FEES);
  dailySupplySideRevenue.addUSDValue(data.assetYields, METRIC.ASSETS_YIELDS);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]:
      "0.22% gross expense ratio prorated over the fetch period and applied to BENJI shares outstanding.",
    [METRIC.ASSETS_YIELDS]:
      "BENJI/iBENJI distributions from EVM DividendDistributed shares, Solana DistributeDividend2 mint transactions, Aptos DividendDistributed events, and Stellar DIVR issuer payments.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]:
      "Fund management fees retained by Franklin Templeton.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]:
      "BENJI/iBENJI distributions paid to fund shareholders as newly minted shares or issuer payments.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees:
      "BENJI distributions from DividendDistributed shares on EVM chains, Solana DistributeDividend2 mint transactions, Aptos DividendDistributed events, and Stellar BENJI issuer transactions with DIVR memos, plus fund-level expenses calculated from a 0.22% gross expense ratio on total supply.",
    Revenue:
      "Franklin Templeton fund expenses, calculated from a 0.22% gross expense ratio on total supply.",
    SupplySideRevenue:
      "BENJI distributions/newly minted fund shares distributed to holders, using DividendDistributed shares on EVM chains, Solana DistributeDividend2 mint transactions, Aptos DividendDistributed events, and Stellar BENJI issuer payments with DIVR memos.",
  },
  breakdownMethodology,
  isExpensiveAdapter: true,
  allowNegativeValue: true,
  dependencies: [Dependencies.DUNE],
};

export default adapter;
