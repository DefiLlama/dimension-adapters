import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { ChainApi } from "@defillama/sdk";
import ADDRESSES from "../helpers/coreAssets.json";

const FETCH_RFQ_CUTOFF = 1766361600; //2025-12-22 00:00:00 UTC
// 0x Settler deployer/registry - see: https://github.com/0xProject/0x-settler 
const SETTLER_DEPLOYER = "0x00000000000004533fe15556b1e086bb1a72ceae";
const RFQ_PATTERN = "'d92aadfb[0-9a-f]{64}000000000000000000000000([0-9a-f]{40})([0-9a-f]{64})'";
const VIP_PATTERN = "'(604ba49a|9714f25e)[0-9a-f]{344}([0-9a-f]{40})([0-9a-f]{64})'";

const chainConfig = {
  [CHAIN.ETHEREUM]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'ethereum', start: '2020-06-11' },
  [CHAIN.POLYGON]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'polygon', start: '2021-05-12' },
  [CHAIN.BSC]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'bnb', start: '2021-03-04' },
  [CHAIN.OPTIMISM]: { exchange: '0xdef1abe32c034e558cdd535791643c58a13acc10', duneChain: 'optimism', start: '2021-12-22' },
  [CHAIN.FANTOM]: { exchange: '0xdef189deaef76e379df891899eb5a00a94cbc250', start: '2021-10-11' },
  [CHAIN.CELO]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', start: '2021-10-15' },
  [CHAIN.AVAX]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'avalanche_c', start: '2021-08-26' },
  [CHAIN.ARBITRUM]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'arbitrum', start: '2021-12-23' },
  [CHAIN.BASE]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'base', start: '2023-07-17' },
  [CHAIN.HYPERLIQUID]: { duneChain: 'hyperevm', start: '2025-12-22' },
} as { [chain: string]: { exchange?: string, duneChain?: string, start: string } }

/*
  0x RFQ volume is split across two generations:

  - Before the cutoff, RFQ fills are emitted by the legacy 0x Exchange Proxy as
    RfqOrderFilled events, so fetchRFQ can use normal indexed event logs.
  - After the cutoff, RFQ fills move through 0x Settler. Settler does not emit a
    normal decoded RFQ event with the maker token address. Instead, it emits a
    topicless 48-byte marker log from the active Settler contract. The marker log
    contains the RFQ order/hash fragment plus the filled maker amount, but not the
    maker token.

  The active Settler contracts are discovered from the official cross-chain
  Settler deployer/registry. ownerOf(2), ownerOf(3), and ownerOf(4) resolve the
  current taker-submitted, metatxn/gasless, and intent Settler deployments at the
  requested historical start timestamp. A revert/zero result is ignored, which
  covers paused or unavailable features.

  To price a Settler RFQ fill we need to bind that marker amount to a token. We
  do that by reading only transactions that already have a candidate marker log,
  then parsing the Settler calldata action blobs. The regexes below were derived
  from real Settler calldata samples:
    - d92aadfb is the RFQ action selector.
    - 604ba49a / 9714f25e are VIP-style RFQ action selectors.
  Those calldata actions include token + action amount. We order marker logs and
  calldata actions inside each tx, match by row number, and require the marker
  filled amount to be <= the calldata action amount. That gives the maker token
  for the marker amount while avoiding broad ERC20 transfer scans.
*/

const fetchRFQ = async ({ getLogs, chain, createBalances }: FetchOptions): Promise<FetchResult> => {
  const { exchange } = chainConfig[chain];
  const dailyVolume = createBalances()
  if (!exchange) return { dailyVolume }

  const logs = await getLogs({ target: exchange, eventAbi: "event RfqOrderFilled(bytes32 orderHash, address maker, address taker, address makerToken, address takerToken, uint128 takerTokenFilledAmount, uint128 makerTokenFilledAmount, bytes32 pool)" })
  logs.forEach(log => dailyVolume.add(log.makerToken, log.makerTokenFilledAmount))
  return { dailyVolume }
}

const prefetch = async (options: FetchOptions) => {
  if (options.startTimestamp < FETCH_RFQ_CUTOFF) return [];

  const chainQueries = (await Promise.all(Object.entries(chainConfig)
    .filter(([, { duneChain, start }]) => duneChain && options.startTimestamp >= Date.parse(`${start}T00:00:00Z`) / 1e3)
    .map(async ([chain, { duneChain }]) => {
      // Resolve only the active Settler addresses for this historical window.
      const settlers = [...new Set((await new ChainApi({ chain, timestamp: options.startTimestamp }).multiCall({
        target: SETTLER_DEPLOYER,
        abi: "function ownerOf(uint256 tokenId) view returns (address)",
        calls: [2, 3, 4],
        permitFailure: true,
      }))
        .filter(Boolean)
        .map((settler: string) => settler.toLowerCase())
        .filter((settler: string) => settler !== ADDRESSES.null)
      )];
      const cte = chain.replace(/[^a-z0-9]/gi, "_");

      if (!settlers.length) return;

      /*
        Per-chain Dune query shape:
        1. *_rfq_logs starts from the narrowest source: topicless 48-byte logs
           emitted by active Settler contracts in TIME_RANGE.
        2. *_txs reads calldata only for those candidate tx hashes and requires
           successful transactions, so transactions are not scanned broadly.
        3. *_rfq_actions extracts token/amount from known Settler RFQ calldata
           action layouts and ranks actions in calldata order.
        4. *_matched pairs the nth marker log with the nth RFQ calldata action in
           the same tx, then keeps only amount-compatible rows.
        5. *_priced converts the matched raw token amount to USD using prices.day
           for the matched token/day.
      */
      return {
        ctes: `
        ${cte}_rfq_logs AS (
          SELECT
            block_time,
            tx_hash,
            bytearray_to_uint256(bytearray_substring(data, 33, 16)) AS maker_filled_amount,
            ROW_NUMBER() OVER (PARTITION BY tx_hash ORDER BY "index") AS fill_rn
          FROM ${duneChain}.logs
          WHERE contract_address IN (${settlers.join(", ")})
            AND topic0 IS NULL
            AND topic1 IS NULL
            AND topic2 IS NULL
            AND topic3 IS NULL
            AND bytearray_length(data) = 48
            AND bytearray_substring(data, 1, 16) != 0x00000000000000000000000000000000
            AND TIME_RANGE
        ),
        ${cte}_txs AS (
          SELECT tx.hash AS tx_hash, lower(to_hex(tx.data)) AS data_hex
          FROM ${duneChain}.transactions tx
          JOIN (SELECT DISTINCT tx_hash FROM ${cte}_rfq_logs) r ON r.tx_hash = tx.hash
          WHERE tx.success
            AND TIME_RANGE
        ),
        ${cte}_rfq_actions AS (
          SELECT
            tx_hash,
            token,
            amount,
            ROW_NUMBER() OVER (PARTITION BY tx_hash ORDER BY action_pos) AS fill_rn
          FROM (
            SELECT
              t.tx_hash,
              regexp_position(t.data_hex, ${RFQ_PATTERN}, 1, CAST(occurrence AS INTEGER)) AS action_pos,
              from_hex(token_hex) AS token,
              bytearray_to_uint256(from_hex(amount_hex)) AS amount
            FROM ${cte}_txs t
            CROSS JOIN UNNEST(
              regexp_extract_all(t.data_hex, ${RFQ_PATTERN}, 1),
              regexp_extract_all(t.data_hex, ${RFQ_PATTERN}, 2)
            ) WITH ORDINALITY AS u(token_hex, amount_hex, occurrence)
            UNION ALL
            SELECT
              t.tx_hash,
              regexp_position(t.data_hex, ${VIP_PATTERN}, 1, CAST(occurrence AS INTEGER)) AS action_pos,
              from_hex(token_hex) AS token,
              bytearray_to_uint256(from_hex(amount_hex)) AS amount
            FROM ${cte}_txs t
            CROSS JOIN UNNEST(
              regexp_extract_all(t.data_hex, ${VIP_PATTERN}, 2),
              regexp_extract_all(t.data_hex, ${VIP_PATTERN}, 3)
            ) WITH ORDINALITY AS u(token_hex, amount_hex, occurrence)
          )
        ),
        ${cte}_matched AS (
          SELECT
            DATE_TRUNC('day', r.block_time) AS fill_day,
            a.token,
            r.maker_filled_amount AS amount
          FROM ${cte}_rfq_logs r
          JOIN ${cte}_rfq_actions a
            ON a.tx_hash = r.tx_hash
           AND a.fill_rn = r.fill_rn
           AND r.maker_filled_amount <= a.amount
        ),
        ${cte}_priced AS (
          SELECT
            (CAST(m.amount AS DOUBLE) / POW(10, p.decimals)) * p.price AS volume_usd
          FROM ${cte}_matched m
          JOIN prices.day p
            ON p.blockchain = '${duneChain}'
           AND p.contract_address = m.token
           AND p.timestamp = m.fill_day
           AND p.timestamp >= DATE_TRUNC('day', from_unixtime(${options.startTimestamp}))
           AND p.timestamp <= DATE_TRUNC('day', from_unixtime(${options.endTimestamp}))
        )`,
        select: `
        SELECT '${chain}' AS chain, COALESCE(SUM(volume_usd), 0) AS daily_volume
        FROM ${cte}_priced`,
      };
    }))).filter(Boolean) as { ctes: string, select: string }[];

  if (!chainQueries.length) return [];

  return queryDuneSql(options, `
    WITH
      ${chainQueries.map(({ ctes }) => ctes).join(",\n")}
      ${chainQueries.map(({ select }) => select).join("\nUNION ALL\n")}
  `.replace(/\s+/g, " ").trim());
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  if (options.startTimestamp < FETCH_RFQ_CUTOFF) return fetchRFQ(options);
  const row = (options.preFetchedResults || []).find((result: { chain: string }) => result.chain === options.chain);
  const settlerVolume = row?.daily_volume ?? 0;

  return { dailyVolume: settlerVolume };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter;
