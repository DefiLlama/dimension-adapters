import { FetchOptions, SimpleAdapter, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// 2025-01-01 00:00:00 UTC — switch from on-chain v4 logs to Dune Settler log0 query
const SETTLER_CUTOFF = 1735689600;

const config: Record<string, { exchange?: string; settler?: string; duneChain?: string; start: string }> = {
  [CHAIN.ETHEREUM]:  { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', settler: '0x7f54F05635d15Cde17A49502fEdB9D1803A3Be8A', duneChain: 'ethereum',    start: '2023-01-01' },
  [CHAIN.POLYGON]:   { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', settler: '0x7150ea07D00d8E5a46bcC809f1c9FDf5cb5f8E81', duneChain: 'polygon',     start: '2023-01-01' },
  [CHAIN.BSC]:       { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', settler: '0xc2eff1F1cE35d395408A34Ad881dBCD978F40b89', duneChain: 'bnb',          start: '2023-01-01' },
  [CHAIN.OPTIMISM]:  { exchange: '0xdef1abe32c034e558cdd535791643c58a13acc10', settler: '0x8CF38ec1BB723e6B948442Dc604b35a54D3Dc893', duneChain: 'optimism',    start: '2023-01-01' },
  [CHAIN.FANTOM]:    { exchange: '0xdef189deaef76e379df891899eb5a00a94cbc250',                                                                                   start: '2023-01-01' },
  [CHAIN.CELO]:      { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',                                                                                   start: '2023-01-01' },
  [CHAIN.AVAX]:      { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', settler: '0x6De411A14aEaafB3f23697A4472a4D4ed275Ac0f', duneChain: 'avalanche_c', start: '2023-01-01' },
  [CHAIN.ARBITRUM]:  { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', settler: '0xfeEA2A79D7d3d36753C8917AF744D71f13C9b02a', duneChain: 'arbitrum',    start: '2023-01-01' },
  [CHAIN.BASE]:      { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', settler: '0x7747F8D2a76BD6345Cc29622a946A929647F2359', duneChain: 'base',         start: '2023-08-01' },
  // Settler-only chains (Dune for current data)
  [CHAIN.BERACHAIN]: { settler: '0x4D97d7E4230003277FD02AbeaBeE835De389b673', duneChain: 'berachain', start: '2025-02-01' },
  [CHAIN.BLAST]:     { settler: '0x9dEf2d15F0E6eEddCe5D5E53744AFA48D89d5FFc', duneChain: 'blast',     start: '2024-12-01' },
  [CHAIN.XDAI]:      { settler: '0xC4709F3d83C716a64A0f77e50b11BE98620b110D', duneChain: 'gnosis',    start: '2024-12-01' },
  [CHAIN.INK]:       { settler: '0x51d9175CEE6eAdCD99936C13C5e6d8D172e6158f', duneChain: 'ink',       start: '2025-01-01' },
  [CHAIN.LINEA]:     { settler: '0x1816eA2150e74Eb3068A4e3809E461Cc6977A7D7', duneChain: 'linea',     start: '2024-12-01' },
  [CHAIN.MANTLE]:    { settler: '0xe3fBE7889A51d62AcD4E056d756F6eA04a3d8D2d', duneChain: 'mantle',    start: '2024-12-01' },
  [CHAIN.MODE]:      { settler: '0x42118eCae71CffA9D4b56598B21D7B29b2F4D58C', duneChain: 'mode',      start: '2024-12-01' },
  [CHAIN.MONAD]:     { settler: '0xfb78Fcae443eB423b59B8C186518c5dF94416344',                         start: '2025-04-01' },
  [CHAIN.SCROLL]:    { settler: '0x06E1DFE03bEaFC30A87b91b9c504926cAf9b8094', duneChain: 'scroll',    start: '2024-12-01' },
  [CHAIN.SONIC]:     { settler: '0x1544b5A855C5D1A0D61e3efaC53b3FBEDb83Ba80', duneChain: 'sonic',     start: '2025-01-01' },
  [CHAIN.UNICHAIN]:  { settler: '0x972655fACb8Df3CdF40395E4262f874f81674D46', duneChain: 'unichain',  start: '2025-02-01' },
};

// queryDuneSql replaces the first "CHAIN" occurrence and all "TIME_RANGE" occurrences.
// We pre-substitute duneChain (appears 3×) and the settler address (appears 2×) via
// template literals so only TIME_RANGE remains for queryDuneSql to fill in.
const buildSettlerQuery = (duneChain: string, settler: string) => {
  const addr = settler.toLowerCase();
  return `
WITH rfq_raw_logs AS (
    SELECT block_time, tx_hash,
        bytearray_to_uint256(bytearray_substring(data, 17, 16)) AS maker_filled_amount
    FROM ${duneChain}.logs
    WHERE contract_address = ${addr}
      AND topic0 IS NULL AND topic1 IS NULL
      AND topic2 IS NULL AND topic3 IS NULL
      AND bytearray_length(data) = 48
      AND TIME_RANGE
),
maker_transfers AS (
    SELECT evt_tx_hash AS tx_hash, contract_address AS token, value AS amount,
        ROW_NUMBER() OVER (PARTITION BY evt_tx_hash ORDER BY value DESC) AS rn
    FROM erc20_${duneChain}.evt_Transfer
    WHERE "from" = ${addr}
      AND TIME_RANGE
),
rfq_with_usd AS (
    SELECT (t.amount / POW(10, p.decimals)) * p.price AS volume_usd
    FROM rfq_raw_logs r
    LEFT JOIN maker_transfers t ON t.rn = 1 AND r.tx_hash = t.tx_hash
    LEFT JOIN prices.usd p
      ON p.contract_address = t.token
     AND p.blockchain = '${duneChain}'
     AND p.minute = DATE_TRUNC('minute', r.block_time)
    WHERE t.token IS NOT NULL AND p.decimals IS NOT NULL AND p.price IS NOT NULL
)
SELECT COALESCE(SUM(volume_usd), 0) AS daily_volume FROM rfq_with_usd
`;
};

const fetch = async (options: FetchOptions) => {
  const { getLogs, chain, createBalances, startTimestamp } = options;
  const { exchange, settler, duneChain } = config[chain];

  if (startTimestamp < SETTLER_CUTOFF && exchange) {
    try {
      const dailyVolume = createBalances();
      const logs = await getLogs({
        target: exchange,
        eventAbi: "event RfqOrderFilled(bytes32 orderHash, address maker, address taker, address makerToken, address takerToken, uint128 takerTokenFilledAmount, uint128 makerTokenFilledAmount, bytes32 pool)",
      });
      logs.forEach((log: any) => dailyVolume.add(log.makerToken, log.makerTokenFilledAmount));
      return { dailyVolume };
    } catch (e) {
      console.error(`[0x-rfq] RfqOrderFilled fetch failed for ${chain}:`, e);
      return { dailyVolume: 0 };
    }
  }

  if (startTimestamp >= SETTLER_CUTOFF && settler && duneChain) {
    try {
      const rows = await queryDuneSql(options, buildSettlerQuery(duneChain, settler));
      return { dailyVolume: rows?.[0]?.daily_volume ?? 0 };
    } catch (e) {
      console.error(`[0x-rfq] Dune Settler fetch failed for ${chain}:`, e);
      return { dailyVolume: 0 };
    }
  }

  return { dailyVolume: 0 };
};

const adapter: SimpleAdapter = {
  pullHourly: true,
  version: 2,
  dependencies: [Dependencies.DUNE],
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
};

export default adapter;
