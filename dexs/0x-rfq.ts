import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const SETTLER_CUTOFF = 1735689600; // 2025-01-01 UTC — 0x migrated DEX RFQ flow from Exchange v4 to Settler

const config: Record<string, { exchange?: string; duneChain?: string; start: string }> = {
  [CHAIN.ETHEREUM]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'ethereum', start: '2023-01-01' },
  [CHAIN.POLYGON]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'polygon', start: '2023-01-01' },
  [CHAIN.BSC]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'bnb', start: '2023-01-01' },
  [CHAIN.OPTIMISM]: { exchange: '0xdef1abe32c034e558cdd535791643c58a13acc10', duneChain: 'optimism', start: '2023-01-01' },
  [CHAIN.FANTOM]: { exchange: '0xdef189deaef76e379df891899eb5a00a94cbc250', start: '2023-01-01' },
  [CHAIN.CELO]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', start: '2023-01-01' },
  [CHAIN.AVAX]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'avalanche_c', start: '2023-01-01' },
  [CHAIN.ARBITRUM]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'arbitrum', start: '2023-01-01' },
  [CHAIN.BASE]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', duneChain: 'base', start: '2023-08-01' },
  [CHAIN.BERACHAIN]: { duneChain: 'berachain', start: '2025-02-01' },
  [CHAIN.BLAST]: { duneChain: 'blast', start: '2024-12-01' },
  [CHAIN.XDAI]: { duneChain: 'gnosis', start: '2024-12-01' },
  [CHAIN.INK]: { duneChain: 'ink', start: '2025-01-01' },
  [CHAIN.LINEA]: { duneChain: 'linea', start: '2024-12-01' },
  [CHAIN.MANTLE]: { duneChain: 'mantle', start: '2024-12-01' },
  [CHAIN.MODE]: { duneChain: 'mode', start: '2024-12-01' },
  [CHAIN.SCROLL]: { duneChain: 'scroll', start: '2024-12-01' },
  [CHAIN.SONIC]: { duneChain: 'sonic', start: '2025-01-01' },
  [CHAIN.UNICHAIN]: { duneChain: 'unichain', start: '2025-02-01' },
};

// 0x Settler emits an anonymous log0 on every RFQ fill: 48 bytes of data, no topics.
// Layout: [orderHash 32B][makerFilledAmount uint128 16B]; chunk3 (bytes 33–48) is
// the maker amount. Settler instances rotate — discover them dynamically from the
// log0 pattern in the time window, then identify the maker token by joining the
// only outgoing Transfer event in the tx whose value equals makerFilledAmount.
// Transfer is read from raw logs (topic0 = Transfer signature) so the same SQL
// works on chains without a decoded `erc20_<chain>` namespace.
const buildSettlerQuery = (duneChain: string) => `
WITH rfq_raw_logs AS (
    SELECT block_time, tx_hash, contract_address AS settler,
        bytearray_to_uint256(bytearray_substring(data, 33, 16)) AS maker_filled_amount
    FROM ${duneChain}.logs
    WHERE topic0 IS NULL AND topic1 IS NULL
      AND topic2 IS NULL AND topic3 IS NULL
      AND bytearray_length(data) = 48
      AND TIME_RANGE
),
settlers AS (SELECT DISTINCT settler FROM rfq_raw_logs),
settler_topics AS (
    SELECT bytearray_concat(0x000000000000000000000000, settler) AS settler_topic FROM settlers
),
candidate_transfers AS (
    SELECT DISTINCT tx_hash, contract_address AS token,
        bytearray_to_uint256(data) AS amount
    FROM ${duneChain}.logs
    WHERE topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
      AND topic1 IN (SELECT settler_topic FROM settler_topics)
      AND TIME_RANGE
),
matched AS (
    SELECT r.block_time, t.token, t.amount
    FROM rfq_raw_logs r
    JOIN candidate_transfers t
      ON r.tx_hash = t.tx_hash
     AND t.amount = r.maker_filled_amount
),
priced AS (
    SELECT (m.amount / POW(10, p.decimals)) * p.price AS volume_usd
    FROM matched m
    LEFT JOIN prices.usd p
      ON p.contract_address = m.token
     AND p.blockchain = '${duneChain}'
     AND p.minute = DATE_TRUNC('minute', m.block_time)
    WHERE p.decimals IS NOT NULL AND p.price IS NOT NULL
)
SELECT COALESCE(SUM(volume_usd), 0) AS daily_volume FROM priced
`;

const fetch = async (options: FetchOptions) => {
  const { getLogs, chain, createBalances, endTimestamp } = options;
  const { exchange, duneChain } = config[chain];

  if ((endTimestamp <= SETTLER_CUTOFF || !duneChain) && exchange) {
    const dailyVolume = createBalances();
    const logs = await getLogs({
      target: exchange,
      eventAbi: "event RfqOrderFilled(bytes32 orderHash, address maker, address taker, address makerToken, address takerToken, uint128 takerTokenFilledAmount, uint128 makerTokenFilledAmount, bytes32 pool)",
    });
    logs.forEach((log: any) => dailyVolume.add(log.makerToken, log.makerTokenFilledAmount));
    return { dailyVolume };
  }

  if (duneChain) {
    const rows = await queryDuneSql(options, buildSettlerQuery(duneChain));
    const dailyVolume = createBalances();
    dailyVolume.addUSDValue(Number(rows?.[0]?.daily_volume ?? 0));
    return { dailyVolume };
  }

  return { dailyVolume: createBalances() };
};

const adapter: SimpleAdapter = {
  version: 2,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
};

export default adapter;
