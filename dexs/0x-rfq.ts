import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const RFQ_PATTERN = "'d92aadfb[0-9a-f]{64}000000000000000000000000([0-9a-f]{40})([0-9a-f]{64})'";
const VIP_PATTERN = "'(604ba49a|9714f25e)[0-9a-f]{344}([0-9a-f]{40})([0-9a-f]{64})'";

const chainConfig: Record<string, { start: string; duneChain: string; settlers: string[] }> = {
  [CHAIN.ETHEREUM]: { start: "2026-01-01", duneChain: "ethereum", settlers: ["0x7f54F05635d15Cde17A49502fEdB9D1803A3Be8A", "0x0476C2483f4c6AA4Dfb6EFA29815AB74d9C1e508", "0xF24be3404B723e35d9EbC60977B646d2581F57F0"] },
  // [CHAIN.ABSTRACT]: { start: "2026-01-01", duneChain: "abstract", settlers: ["0x5138FB70799738534717D9Bf7226D73c6233d95b", "0x94b2AEdc39B21270Ea2EbB4D1a737802C1B0C7a4", "0xd5292bD92BFB2911a12ff29Ffa19660244470f74"] },
  [CHAIN.ARBITRUM]: { start: "2026-01-01", duneChain: "arbitrum", settlers: ["0xfeEA2A79D7d3d36753C8917AF744D71f13C9b02a", "0xfbeCF057d93430a15A936Dd57A7424D4F0A8772b", "0x97C82fcF108E0055C84FE3899AB479df0687fB58"] },
  [CHAIN.AVAX]: { start: "2026-01-01", duneChain: "avalanche_c", settlers: ["0x6De411A14aEaafB3f23697A4472a4D4ed275Ac0f", "0xE679904ee2F0f7092a66E7dAba61a81718520e17", "0x10bFdbE1b29229ACd81651c7449BBb634208Fc6e"] },
  [CHAIN.BSC]: { start: "2026-01-01", duneChain: "bnb", settlers: ["0xc2eff1F1cE35d395408A34Ad881dBCD978F40b89", "0xFffdb7DBAEaf3138B7cfc2328c21f9343C1f7faA", "0xf237dE6cffe730BB6ae035dB3782Dc1e44f86d6c"] },
  [CHAIN.BASE]: { start: "2026-01-01", duneChain: "base", settlers: ["0x7747F8D2a76BD6345Cc29622a946A929647F2359", "0x68A14203953130ae840e37DBe3d64c1E6858da7b", "0x6b6e87D2Cc438C287a5550a8732C302454E4382b"] },
  // [CHAIN.BERACHAIN]: { start: "2026-01-01", duneChain: "berachain", settlers: ["0x4D97d7E4230003277FD02AbeaBeE835De389b673", "0x3AC6428AAAa7f3ffcc061B580785492C7a88b578", "0x83Bf4236DfDfbc93bE129ea9f973776fB23451F1"] },
  // [CHAIN.BLAST]: { start: "2026-01-01", duneChain: "blast", settlers: ["0x9dEf2d15F0E6eEddCe5D5E53744AFA48D89d5FFc", "0xaD8326577D2B23574f369ddf4F74C787872d5791", "0x11CC5FF460992CA3f424aE0e0A8D48d4105e24AA"] },
  // [CHAIN.XDAI]: { start: "2026-01-01", duneChain: "gnosis", settlers: ["0xC4709F3d83C716a64A0f77e50b11BE98620b110D", "0xa4a420aFB00593Dd4e84C5E4E32Dd1daeDE2627F", "0x28356CB0056D2d7692B59c2643003e503Bb04274"] },
  [CHAIN.HYPERLIQUID]: { start: "2026-01-01", duneChain: "hyperevm", settlers: ["0xb32b027C59F540C22B4c76bF849BcF853B99F158", "0x1Df987dF352F0e2733eB503C299E21b9BEf97d80", "0x92948d75D3774C5bb21C95417C6c7B3a898dB1C4"] },
  // [CHAIN.INK]: { start: "2026-01-01", duneChain: "ink", settlers: ["0x51d9175CEE6eAdCD99936C13C5e6d8D172e6158f", "0xa049867cD65f08A8417C43D4113bfc42Dc66B46f", "0x20C274f618CC2800B21A775C3D9E12cd4d19f84c"] },
  // [CHAIN.KATANA]: { start: "2026-01-01", duneChain: "katana", settlers: ["0x44C78971d85CFe877d0F3ED2DE784Db465627C86", "0xD998Ab89b80A68141772f59D58e58dc7955CFd1F", "0x6793cd516aaFEe387bc4c18C73D52beA10A2D1e0"] },
  // [CHAIN.LINEA]: { start: "2026-01-01", duneChain: "linea", settlers: ["0x1816eA2150e74Eb3068A4e3809E461Cc6977A7D7", "0x6344f4252158e0b8e888537Fe887C91b4aA31eeb", "0x630181a646f88199e6EB266ca26f0b663F22561f"] },
  // [CHAIN.MANTLE]: { start: "2026-01-01", duneChain: "mantle", settlers: ["0xe3fBE7889A51d62AcD4E056d756F6eA04a3d8D2d", "0x65b22c39332fb06A0B3f10E9489968A7a2D94f9a", "0xe3e1d9a3D84b7b2D577479601dCd510D9861C269"] },
  // [CHAIN.MODE]: { start: "2026-01-01", duneChain: "mode", settlers: ["0x42118eCae71CffA9D4b56598B21D7B29b2F4D58C", "0xFEdAB706Bd9E45e41c832698B7c0E3c00A74C27F", "0x3F17d594Ef5cd3cF88E169ECF2636E9f892f1e87"] },
  [CHAIN.MONAD]: { start: "2026-01-01", duneChain: "monad", settlers: ["0xfb78Fcae443eB423b59B8C186518c5dF94416344", "0xc15Be1BdeFddCcC9dBb9Df43DD5E71A3eA41ea69", "0x364617D6438a9b939A73483642029cb337D9B86d"] },
  [CHAIN.OPTIMISM]: { start: "2026-01-01", duneChain: "optimism", settlers: ["0x8CF38ec1BB723e6B948442Dc604b35a54D3Dc893", "0x653222aA088002a8287eE7f728c9c510a7c0Cd4F", "0xa69cec3e269b1D2b753b0165350EA8CAab2A4B63"] },
  // [CHAIN.PLASMA]: { start: "2026-01-01", duneChain: "plasma", settlers: ["0x7F2194E8d4D5B5F889b17aeCe891F89Da74F5384", "0x646a39aBc88E1c73ff373f1591922D1a8a959fC3", "0x981E618F1b8B349911551661DD209cD95259eb62"] },
  [CHAIN.POLYGON]: { start: "2026-01-01", duneChain: "polygon", settlers: ["0x7150ea07D00d8E5a46bcC809f1c9FDf5cb5f8E81", "0x8060702b1A65761127ACaCDe6d6B23f33C4dcD9e", "0xE01013B5b66e9F1510dDc0Bf0A167806A5bf8FCc"] },
  // [CHAIN.SCROLL]: { start: "2026-01-01", duneChain: "scroll", settlers: ["0x06E1DFE03bEaFC30A87b91b9c504926cAf9b8094", "0x392a2aC35332a76D39c9355a4cCe90B6E5d4f189", "0x29e5ab9db1cbfd60Cb3b3dA3fD02864602673F24"] },
  // [CHAIN.SONIC]: { start: "2026-01-01", duneChain: "sonic", settlers: ["0x1544b5A855C5D1A0D61e3efaC53b3FBEDb83Ba80", "0xBF1DBE5296e8c16A1BA693b6F26561352cc6ECC7", "0xa2AD8C2D44BE856597A304CF4318CE0053B073AC"] },
  // [CHAIN.TAIKO]: { start: "2026-01-01", duneChain: "taiko", settlers: ["0x11e42949CC38A975fD97034E49d57b2291f11129", "0x3294df9ebef24cF0588C9f32F253FcF4223d8dB4", "0xf6fFEc45C7306b982DD825Ba6C102B5a2888E5C5"] },
  // [CHAIN.TEMPO]: { start: "2026-01-01", duneChain: "tempo", settlers: ["0xE59F2F6AcE8b9f985900f14462fbAA40385Ce441", "0xcc867b66142751A07ff0F6FE186a526b57496Bc4", "0xD9D8EF0fa41Ab507B8f073F53773053C42B834d3"] },
  [CHAIN.UNICHAIN]: { start: "2026-01-01", duneChain: "unichain", settlers: ["0x972655fACb8Df3CdF40395E4262f874f81674D46", "0xBaE3Eb58Cee014d7f1C2d021715bDA0a75Ec9756", "0xa65dcdFA6A22210660FE32B744DaD87fe0631f52"] },
  // [CHAIN.WC]: { start: "2026-01-01", duneChain: "worldchain", settlers: ["0x1072a0A713A23a2Da9BAB99E9CD68187970E89a4", "0x23b56c2997EdD13550864d13a85d09AA922509D9", "0x8719F236F9EF2dd783eD59A1fC48B5F92EF8775d"] },
};

const prefetch = async (options: FetchOptions) => {
  const chainQueries = Object.entries(chainConfig).map(([chain, { duneChain, settlers }]) => {
    const cte = chain.replace(/[^a-z0-9]/gi, "_");

    return {
      ctes: `
      ${cte}_rfq_logs AS (
        SELECT
          block_time,
          tx_hash,
          "index" AS rfq_log_index,
          bytearray_to_uint256(bytearray_substring(data, 33, 16)) AS maker_filled_amount,
          ROW_NUMBER() OVER (PARTITION BY tx_hash ORDER BY "index") AS fill_rn
        FROM ${duneChain}.logs
        WHERE contract_address IN (${settlers.map((address) => address.toLowerCase()).join(", ")})
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
          r.tx_hash,
          r.rfq_log_index,
          DATE_TRUNC('minute', r.block_time) AS fill_minute,
          DATE_TRUNC('day', r.block_time) AS fill_day,
          a.token,
          r.maker_filled_amount AS amount
        FROM ${cte}_rfq_logs r
        JOIN ${cte}_rfq_actions a
          ON a.tx_hash = r.tx_hash
         AND a.fill_rn = r.fill_rn
         AND r.maker_filled_amount <= a.amount
      ),
      ${cte}_hour_prices AS (
        SELECT
          m.tx_hash,
          m.rfq_log_index,
          (CAST(m.amount AS DOUBLE) / POW(10, p.decimals)) * p.price AS volume_usd
        FROM ${cte}_matched m
        JOIN prices.hour p
          ON p.blockchain = '${duneChain}'
         AND p.contract_address = m.token
         AND p.timestamp = DATE_TRUNC('hour', m.fill_minute)
         AND p.timestamp >= DATE_TRUNC('hour', from_unixtime(${options.startTimestamp}))
         AND p.timestamp <= DATE_TRUNC('hour', from_unixtime(${options.endTimestamp}))
      ),
      ${cte}_best_hour_price AS (
        SELECT tx_hash, rfq_log_index, volume_usd
        FROM ${cte}_hour_prices
      ),
      ${cte}_day_prices AS (
        SELECT
          (CAST(m.amount AS DOUBLE) / POW(10, p.decimals)) * p.price AS volume_usd
        FROM ${cte}_matched m
        LEFT JOIN ${cte}_best_hour_price hp
          ON hp.tx_hash = m.tx_hash
         AND hp.rfq_log_index = m.rfq_log_index
        JOIN prices.day p
          ON p.blockchain = '${duneChain}'
         AND p.contract_address = m.token
         AND p.timestamp = m.fill_day
         AND p.timestamp >= DATE_TRUNC('day', from_unixtime(${options.startTimestamp}))
         AND p.timestamp <= DATE_TRUNC('day', from_unixtime(${options.endTimestamp}))
        WHERE hp.tx_hash IS NULL
      )`,
      select: `
      SELECT '${chain}' AS chain, COALESCE(SUM(volume_usd), 0) AS daily_volume
      FROM (
        SELECT volume_usd FROM ${cte}_best_hour_price
        UNION ALL
        SELECT volume_usd FROM ${cte}_day_prices
      )`,
    };
  });
  const query = `
    WITH
      ${chainQueries.map(({ ctes }) => ctes).join(",\n")}
      ${chainQueries.map(({ select }) => select).join("\nUNION ALL\n")}`;

  return queryDuneSql(options, query.replace(/\s+/g, " ").trim());
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const rows = options.preFetchedResults || [];
  const row = rows.find((result: { chain: string }) => result.chain === options.chain);

  return {
    dailyVolume: row?.daily_volume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
