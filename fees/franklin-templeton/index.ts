import { Dependencies, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryDuneSql } from "../../helpers/dune";

const NET_EXPENSE_YEAR = 0.002;
const EVM_BENJI_DECIMALS = 18;

// Source: Franklin Templeton FOBXX distributions; 0.20% net expense ratio applied across BENJI chains.
const chainConfig: any = {
  [CHAIN.ETHEREUM]: {
    start: "2025-01-01",
    tokens: [
      "0x3DDc84940Ab509C11B20B76B466933f40b750dc9",
      "0x90276e9d4A023b5229E0C2e9D4b2a83fe3A2b48c",
    ],
    controllers: [
      "0x8C8Bfc3151C2161a4baD77268e246A08e5D9c666",
      "0xab266e4fa5d088cc440433c3ea1e066fd710a0a5",
    ],
  },
  [CHAIN.POLYGON]: {
    start: "2023-10-04",
    tokens: ["0x408a634b8a8f0de729b48574a3a7ec3fe820b00a"],
    controllers: ["0x72254A323775123BA500b00CaCf3662367Ef52fa"],
  },
  [CHAIN.ARBITRUM]: {
    start: "2025-01-01",
    tokens: ["0xB9e4765BCE2609bC1949592059B17Ea72fEe6C6A"],
    controllers: ["0x3A1540808757b7D9813de9843A9fb4b580844745"],
  },
  [CHAIN.AVAX]: {
    start: "2025-01-01",
    tokens: ["0xE08b4c1005603427420e64252a8b120cacE4D122"],
    controllers: ["0xf208FF7C8aA13a3bF79b56146aAFe81e1Ca27044"],
  },
  [CHAIN.BASE]: {
    start: "2025-01-01",
    tokens: ["0x60CfC2b186a4CF647486e42c42B11cC6D571d1E4"],
    controllers: ["0x095D7B0210C8347C6e080b52b8c3444297f9b27b"],
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
    controllers: ["0x6C4dD0157B714e269E11242e2a4812Ab2c043318"],
  },
  [CHAIN.STELLAR]: {
    start: "2023-10-04",
    issuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
    tokens: "BENJI",
  },
};

const managementFees = (supply: number, periodSeconds: number) =>
  (supply * NET_EXPENSE_YEAR * periodSeconds) / (365 * 86400);

const getStartTimestamp = (start: string) =>
  Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);

const toDecimalNumber = (value: bigint, decimals: number) => {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  return Number(whole) + Number(fraction) / 10 ** decimals;
};

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
        sum(
          case
            when regexp_like(t.memo, 'DIVR\\s+\\d{4}-\\d{2}-\\d{2}\\s+-') then -o.amount
            when o."to" = '${issuer}' then -o.amount
            else o.amount
          end
        ) as daily_dividends
      from stellar.history_operations o
      join stellar.history_transactions t
        on o.transaction_id = t.id
      where o.closed_at >= from_unixtime(${options.startTimestamp})
        and o.closed_at < from_unixtime(${options.endTimestamp})
        and o.asset_code = '${assetCode}'
        and o.asset_issuer = '${issuer}'
        and o.type_string = 'payment'
        and (o."from" = '${issuer}' or o."to" = '${issuer}')
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
  const {
    decimals,
    start,
    tokens: metadata,
  } = chainConfig[CHAIN.APTOS];
  const divisor = 10 ** decimals;
  const startTimestamp = getStartTimestamp(start);
  const distributor =
    "0xe10898758351ac7d32835ca8f7ef75a31232d210a1ba9cb628f85aef8a6f8eb6";
  const query = `
    with latest_supply as (
      select
        max_by(json_extract_scalar(move_data, '$.current.value'), block_time) as supply
      from aptos.move_resources
      where block_time >= from_unixtime(${startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
        and move_address = ${metadata}
        and move_resource_module = 'fungible_asset'
        and move_resource_name = 'ConcurrentSupply'
    ),
    dividends as (
      select
        sum(
          case
            when json_extract_scalar(data, '$.negative_yield') = 'true'
              then -cast(json_extract_scalar(data, '$.shares') as double)
            else cast(json_extract_scalar(data, '$.shares') as double)
          end
        ) as daily_dividends
      from aptos.events
      where block_time >= from_unixtime(${options.startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
        and event_type = '${distributor}::fund_token::DividendDistributedEvent'
        and guid_account_address = ${distributor}
    )
    select
      coalesce(cast((select supply from latest_supply) as double), 0) / ${divisor} as supply,
      coalesce((select daily_dividends from dividends), 0) / ${divisor} as daily_dividends
  `;

  const queryResults = await queryDuneSql(options, query);
  return formatData(queryResults[0], options);
};

const evmData = async (options: any, config: any) => {
  const { controllers, tokens } = config;
  const controllerValues = controllers
    .map((controller: string) => `(${controller})`)
    .join(",\n        ");
  const supplies = await options.api.multiCall({
    abi: "erc20:totalSupply",
    calls: tokens,
  });
  const totalSupplyRaw = supplies.reduce(
    (sum: bigint, value: any) => sum + BigInt(value.toString()),
    0n,
  );
  const supply = toDecimalNumber(totalSupplyRaw, EVM_BENJI_DECIMALS);

  const query = `
    with controllers(contract_address) as (
      values
        ${controllerValues}
    ),
    dividends as (
      select
        case
          when bytearray_to_uint256(bytearray_substring(l.data, 161, 32)) = 1
            then -cast(bytearray_to_uint256(bytearray_substring(l.data, 65, 32)) as double)
          else cast(bytearray_to_uint256(bytearray_substring(l.data, 65, 32)) as double)
        end / 1e${EVM_BENJI_DECIMALS} as shares
      from CHAIN.logs l
      join controllers c
        on l.contract_address = c.contract_address
      where TIME_RANGE
        and l.topic0 = 0xe0b019f23e4f4948c15bdd9dfa8808b046568a2fda0f2978492dcc284fb79c9a
    )
    select
      coalesce(sum(shares), 0) as asset_yields
    from dividends
  `;

  const queryResults = await queryDuneSql(options, query, {
    extraUIDKey: "evm-asset-yields",
  });
  return formatData({ supply, ...queryResults[0] }, options, "asset_yields");
};

const solanaData = async (options: any) => {
  const { decimals, start, tokens: mint } = chainConfig[CHAIN.SOLANA];
  const divisor = 10 ** decimals;
  const startTimestamp = getStartTimestamp(start);
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
      where block_time >= from_unixtime(${startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
        and token_mint_address = '${mint}'
        and action in ('mint', 'burn')
    ),
    benji_txs as (
      select distinct tx_id
      from tokens_solana.transfers
      where block_time >= from_unixtime(${options.startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
        and token_mint_address = '${mint}'
    ),
    dividends as (
      select
        coalesce(sum(cast(regexp_extract(log_message, 'Shares Minted: ([0-9]+)', 1) as double)), 0) as daily_dividends
      from solana.transactions tx
      join benji_txs b
        on tx.id = b.tx_id
      cross join unnest(tx.log_messages) as t(log_message)
      where tx.block_time >= from_unixtime(${options.startTimestamp})
        and tx.block_time < from_unixtime(${options.endTimestamp})
        and contains(tx.log_messages, 'Program log: Instruction: DistributeDividend2')
        and regexp_like(log_message, 'Shares Minted: [0-9]+')
    )
    select
      coalesce((select supply from supply), 0) / ${divisor} as supply,
      coalesce((select daily_dividends from dividends), 0) / ${divisor} as daily_dividends
  `;

  const queryResults = await queryDuneSql(options, query);
  return formatData(queryResults[0], options);
};

const fetch = async (options: FetchOptions) => {
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
          : await evmData(options, chainConfig[chain]);

  dailyFees.addUSDValue(data.managementFees, METRIC.MANAGEMENT_FEES);
  dailyFees.addUSDValue(data.assetYields, METRIC.ASSETS_YIELDS);

  dailyRevenue.addUSDValue(data.managementFees, METRIC.MANAGEMENT_FEES);
  dailySupplySideRevenue.addUSDValue(data.assetYields, 'Assets Yields To Suppliers');

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]:
      "Estimated fund expenses using the 0.20% net expense ratio applied to BENJI shares outstanding.",
    [METRIC.ASSETS_YIELDS]:
      "Net income distributed to BENJI holders. If the fund records negative yield, it reduces this amount.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]:
      "Estimated fund expenses retained by Franklin Templeton.",
  },
  SupplySideRevenue: {
    "Assets Yields To Suppliers":
      "Net income passed through to BENJI holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees:
      "Includes income generated by the fund and distributed to BENJI holders, plus estimated fund expenses based on the 0.20% net expense ratio.",
    Revenue:
      "Estimated fund expenses retained by Franklin Templeton.",
    SupplySideRevenue:
      "Net income distributed to BENJI holders. Negative yield reduces this amount.",
    ProtocolRevenue:
      "Estimated fund expenses retained by Franklin Templeton.",
  },
  breakdownMethodology,
  isExpensiveAdapter: true,
  allowNegativeValue: true,
  dependencies: [Dependencies.DUNE],
};

export default adapter;
