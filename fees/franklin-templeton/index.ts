import { Interface } from "ethers";
import {
  Chain,
  Dependencies,
  FetchOptions,
  FetchResultFees,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryDuneSql } from "../../helpers/dune";

// References and source notes:
// - Fund/distributions: https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX#distributions
// - Gross expense ratio is applied uniformly across BENJI chains per fund-level methodology.
// - EVM/Solana/Aptos/Stellar distributions are pulled from Dune-indexed on-chain events, logs, or memos.

const TOKENS: Partial<Record<Chain, string[]>> = {
  [CHAIN.ETHEREUM]: [
    "0x3DDc84940Ab509C11B20B76B466933f40b750dc9", // BENJI
    "0x90276e9d4A023b5229E0C2e9D4b2a83fe3A2b48c", // iBENJI
  ],
  [CHAIN.POLYGON]: ["0x408a634b8a8f0de729b48574a3a7ec3fe820b00a"],
  [CHAIN.ARBITRUM]: ["0xB9e4765BCE2609bC1949592059B17Ea72fEe6C6A"],
  [CHAIN.AVAX]: ["0xE08b4c1005603427420e64252a8b120cacE4D122"],
  [CHAIN.BASE]: ["0x60CfC2b186a4CF647486e42c42B11cC6D571d1E4"],
  [CHAIN.BSC]: ["0x3d0a2A3a30a43a2C1C4b92033609245E819ae6a6"], // iBENJI
};

const DIVIDEND_DISTRIBUTED_EVENT =
  "event DividendDistributed(address indexed account, uint256 indexed date, int256 rate, uint256 price, uint256 shares, uint256 dividendCashAmount, uint256 dividendBasis, bool isNegativeYield)";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS_TOPIC =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const dividendInterface = new Interface([DIVIDEND_DISTRIBUTED_EVENT]);
const dividendTopic =
  dividendInterface.getEvent("DividendDistributed")!.topicHash;

const GROSS_EXPENSE_YEAR = 0.0022;
const EVM_BENJI_DECIMALS = 18;

const STELLAR_ISSUER =
  "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";
const STELLAR_ASSET_CODE = "BENJI";
const APTOS_BENJI_METADATA =
  "0x7b5e9cac3433e9202f28527f707c89e1e47b19de2c33e4db9521a63ad219b739";
const APTOS_BENJI_DECIMALS = 9;
const APTOS_DIVIDEND_DISTRIBUTED_EVENT =
  "0xe10898758351ac7d32835ca8f7ef75a31232d210a1ba9cb628f85aef8a6f8eb6::fund_token::DividendDistributedEvent";
const SOLANA_BENJI_MINT = "5Tu84fKBpe9vfXeotjvfvWdWbAjy3hqsExvuHgFqFxA1";
const SOLANA_BENJI_DECIMALS = 9;

type FranklinData = { assetYields: number; managementFees: number };

const managementFees = (supply: number, periodSeconds: number) =>
  (supply * GROSS_EXPENSE_YEAR * periodSeconds) / (365 * 86400);

const stellarData = async (
  options: FetchOptions,
): Promise<FranklinData> => {
  // Stellar dividends are issuer payments with DIVR memos; supply is rebuilt from live trust-line balances.
  const query = `
    with latest_trust_lines as (
      select
        ledger_key,
        max_by(balance, closed_at) as balance,
        max_by(deleted, closed_at) as deleted
      from stellar.trust_lines
      where closed_at < from_unixtime(${options.endTimestamp})
        and asset_code = '${STELLAR_ASSET_CODE}'
        and asset_issuer = '${STELLAR_ISSUER}'
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
        and o.asset_code = '${STELLAR_ASSET_CODE}'
        and o.asset_issuer = '${STELLAR_ISSUER}'
        and o.type_string = 'payment'
        and o."from" = '${STELLAR_ISSUER}'
        and t.memo like 'DIVR %'
    )
    select
      coalesce((select sum(balance) from latest_trust_lines where not deleted), 0) as supply,
      coalesce((select daily_dividends from dividends), 0) as daily_dividends
  `;

  const queryResults: {
    supply: string | number | null;
    daily_dividends: string | number | null;
  }[] = await queryDuneSql(options, query);

  const assetYields = Number(queryResults[0]?.daily_dividends ?? 0);
  const supply = Number(queryResults[0]?.supply ?? 0);

  return {
    assetYields,
    managementFees: managementFees(
      supply,
      options.endTimestamp - options.startTimestamp,
    ),
  };
};

const aptosData = async (
  options: FetchOptions,
): Promise<FranklinData> => {
  const divisor = 10 ** APTOS_BENJI_DECIMALS;
  // Aptos exposes both current supply and DividendDistributedEvent shares in Move resources/events.
  const query = `
    with latest_supply as (
      select
        max_by(json_extract_scalar(move_data, '$.current.value'), block_time) as supply
      from aptos.move_resources
      where block_time < from_unixtime(${options.endTimestamp})
        and move_address = ${APTOS_BENJI_METADATA}
        and move_resource_module = 'fungible_asset'
        and move_resource_name = 'ConcurrentSupply'
    ),
    dividends as (
      select
        sum(cast(json_extract_scalar(data, '$.shares') as double)) as daily_dividends
      from aptos.events
      where block_time >= from_unixtime(${options.startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
        and event_type = '${APTOS_DIVIDEND_DISTRIBUTED_EVENT}'
    )
    select
      coalesce(cast((select supply from latest_supply) as double), 0) / ${divisor} as supply,
      coalesce((select daily_dividends from dividends), 0) / ${divisor} as daily_dividends
  `;

  const queryResults: {
    supply: string | number | null;
    daily_dividends: string | number | null;
  }[] = await queryDuneSql(options, query);

  const assetYields = Number(queryResults[0]?.daily_dividends ?? 0);
  const supply = Number(queryResults[0]?.supply ?? 0);

  return {
    assetYields,
    managementFees: managementFees(
      supply,
      options.endTimestamp - options.startTimestamp,
    ),
  };
};

const evmData = async (
  options: FetchOptions,
  tokens: string[],
): Promise<FranklinData> => {
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
          l.topic0 = ${TRANSFER_TOPIC}
          or l.topic0 = ${dividendTopic}
        )
    ),
    supply_transfers as (
      select
        sum(
          case
            when l.topic1 = ${ZERO_ADDRESS_TOPIC} then cast(bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) as double)
            when l.topic2 = ${ZERO_ADDRESS_TOPIC} then -cast(bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) as double)
            else 0
          end
        ) / 1e${EVM_BENJI_DECIMALS} as supply
      from chain_logs l
      join tokens t
        on l.contract_address = t.contract_address
      where l.topic0 = ${TRANSFER_TOPIC}
        and (
          l.topic1 = ${ZERO_ADDRESS_TOPIC}
          or l.topic2 = ${ZERO_ADDRESS_TOPIC}
        )
    ),
    dividend_txs as (
      select distinct
        l.tx_hash
      from chain_logs l
      join tokens t
        on l.contract_address = t.contract_address
      where TIME_RANGE
        and l.topic0 = ${TRANSFER_TOPIC}
        and l.topic1 = ${ZERO_ADDRESS_TOPIC}
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
        and l.topic0 = ${dividendTopic}
    )
    select
      coalesce((select supply from supply_transfers), 0) as supply,
      coalesce(sum(shares), 0) as asset_yields
    from dividends
  `;

  const queryResults: {
    supply: string | number | null;
    asset_yields: string | number | null;
  }[] =
    await queryDuneSql(options, query, { extraUIDKey: "evm-asset-yields" });

  const supply = Number(queryResults[0]?.supply ?? 0);
  const assetYields = Number(queryResults[0]?.asset_yields ?? 0);

  return {
    assetYields,
    managementFees: managementFees(
      supply,
      options.endTimestamp - options.startTimestamp,
    ),
  };
};

const solanaData = async (
  options: FetchOptions,
): Promise<FranklinData> => {
  const divisor = 10 ** SOLANA_BENJI_DECIMALS;
  // Solana dividends are mint transfers in transactions logging DistributeDividend2; Dune amounts are raw.
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
        and token_mint_address = '${SOLANA_BENJI_MINT}'
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
        and t.token_mint_address = '${SOLANA_BENJI_MINT}'
        and t.action = 'mint'
    )
    select
      coalesce((select supply from supply), 0) / ${divisor} as supply,
      coalesce((select daily_dividends from dividends), 0) / ${divisor} as daily_dividends
  `;

  const queryResults: {
    supply: string | number | null;
    daily_dividends: string | number | null;
  }[] = await queryDuneSql(options, query);

  const assetYields = Number(queryResults[0]?.daily_dividends ?? 0);
  const supply = Number(queryResults[0]?.supply ?? 0);

  return {
    assetYields,
    managementFees: managementFees(
      supply,
      options.endTimestamp - options.startTimestamp,
    ),
  };
};

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const { api, chain, createBalances } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  let data: FranklinData;

  if (api.chain === CHAIN.STELLAR) {
    data = await stellarData(options);
  } else if (api.chain === CHAIN.APTOS) {
    data = await aptosData(options);
  } else if (api.chain === CHAIN.SOLANA) {
    data = await solanaData(options);
  } else {
    data = await evmData(options, TOKENS[chain]!);
  }

  dailyFees.addUSDValue(data.managementFees, METRIC.MANAGEMENT_FEES);
  dailyFees.addUSDValue(data.assetYields, METRIC.ASSETS_YIELDS);

  dailyRevenue.addUSDValue(data.managementFees, METRIC.MANAGEMENT_FEES);
  dailySupplySideRevenue.addUSDValue(data.assetYields, METRIC.ASSETS_YIELDS);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const chainConfig = (
  chain: Chain,
  start: string,
  runAtCurrTime = true,
): [Chain, { start: string; runAtCurrTime?: boolean }] => {
  return [chain, { start, ...(runAtCurrTime ? { runAtCurrTime: true } : {}) }];
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
  version: 2,
  pullHourly: true,
  fetch,
  chains: [
    chainConfig(CHAIN.ETHEREUM, "2025-01-01", false),
    chainConfig(CHAIN.POLYGON, "2023-10-04"),
    chainConfig(CHAIN.ARBITRUM, "2025-01-01"),
    chainConfig(CHAIN.AVAX, "2025-01-01"),
    chainConfig(CHAIN.BASE, "2025-01-01"),
    chainConfig(CHAIN.APTOS, "2026-05-01"),
    chainConfig(CHAIN.SOLANA, "2026-05-01"),
    chainConfig(CHAIN.BSC, "2025-01-01"),
    chainConfig(CHAIN.STELLAR, "2023-10-04"),
  ],
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
  dependencies: [Dependencies.DUNE],
};

export default adapter;
