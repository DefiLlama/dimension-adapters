import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { getMultipleAccounts } from "../helpers/solana";

// The operator wallet creates the pools, claims every platform fee, pays the creator and flywheel shares and
// signs the buybacks.
const OPERATOR = "5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG";
const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";

// Raydium Burn & Earn. Pre-LaunchLab launches lock their liquidity here and the operator harvests the fees.
const LOCK_PROGRAM = "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE";

// Raydium LaunchLab. Platform fees collect in one vault per platform and quote token, and this program-wide
// authority moves them out. Only a platform's claim wallet can claim, so any vault claim paid to the operator
// is StonkFun's, whichever platform config it comes from (Community Mode included).
const LAUNCHLAB_PROGRAM = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj";
const LAUNCHLAB_FEE_VAULT_AUTHORITY = "56XVRVAsgWv6ADaxzoNnbL38LMoWKM5WiSAhrAWUbd2p";
// Per-pool claim route. StonkFun claims from the vaults, but this route still counts if it claims per pool.
const LAUNCHLAB_POOL_AUTHORITY = "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh";

// Raydium CPMM. Graduated launches migrate here with the operator as pool creator, and the operator collects
// the creator fee directly from the pool vaults.
const CPMM_PROGRAM = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";
const CPMM_AUTHORITY = "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL";
const CLMM_PROGRAM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";

// Receives the flywheel share of reward launches. The creator share of standard launches goes to each launch's
// creator wallet.
const FLYWHEEL_WALLET = "HU3bsSLMoJRzREe2qakCgrFpXky6NH2xpa3AfQfh1MaG";

// Quote vault (SPYX) of STONK's own pool. From 2026-08-28, fees paid in STONK and fees from STONK's own pool
// count as fees but not as revenue, since neither can fund a STONK buyback.
const STONK_POOL_QUOTE_VAULT = "gAqy69bjRT9Sx2tp9Fihfinc6eWHFiwdB4sdjvKtvwH";
const STONK_REVENUE_EXCLUDED_FROM = Date.UTC(2026, 7, 28) / 1000;

// The first creator or flywheel payout went out at 2026-09-04 17:13 UTC. Before then, operator transfers to
// wallets that later launched on LaunchLab were dev-buy deliveries or SOL refunds, not payouts.
const PAYOUTS_FROM = Date.UTC(2026, 8, 4, 17) / 1000;

const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const NATIVE_SOL = "So11111111111111111111111111111111111111111";
const WSOL = ADDRESSES.solana.SOL;

// Each leg is priced from Dune trades in its hour, falling back to the whole day and then the week before.
// An hour price needs at least $100 of trades. Pricing ignores trades more than 10x away from the token's
// median trade price in the window, so one off-market trade in a thin pool can't set a whole day's price.
const PRICE_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;
const MIN_HOUR_USD = 100;
const MAX_PRICE_DEVIATION = 10;

const STONK_POOL_LABEL = "STONK Pool";
const BUYBACK_LABEL = "STONK Buyback And Burn";
const PROTOCOL_REVENUE_LABEL = "Fees to Protocol";

type Leg = { kind: "fee" | "payout" | "buyback"; label: string; mint: string; hour: number; raw_amount: string };
type LegRow = Leg & { tx_id: string | null; two_sided: boolean; t22: boolean; account: string | null; display: number };
type Lookup = { kind: "created" | "landed"; mint: string; ts: number | null; tx_id: string | null; landed: number | null };
type TradeSum = { mint: string; hour: number; usd: number; raw: number };

const sqlList = (values: string[]) => values.map((v) => `'${v}'`).join(", ");

// Dune rejects the legs and their pricing as a single query (too many stages), so prices come from a second
// query over the day's mints. DuneSQL also runs a CTE again for every reference to it, so this query reads the
// day's transfers once and works out each transaction's context with window functions instead of self-joins.
const legsQuery = (start: number, end: number) => `
  WITH
  -- Transfers into and out of the operator wallet. Dune's account table may have no owner for a token account
  -- opened and closed inside one transaction (temporary wSOL). If the operator signed that transaction, the
  -- account is the operator's, so these rows count as the operator's and each step below decides whether to use
  -- them. Only plain transfers count as inflows. token_version identifies native SOL rows, because Dune publishes
  -- their mint both as the wSOL mint and as ${NATIVE_SOL}. Dune labels a native transfer into a token account it
  -- knows as 'wrap'.
  op AS (
    SELECT tx_id, block_time, outer_executing_account AS program, token_mint_address AS mint,
           CASE WHEN token_version = 'native' THEN '${WSOL}' ELSE token_mint_address END AS out_mint,
           amount, amount_display, token_version, from_owner, from_token_account, to_owner, to_token_account,
           COALESCE(action = 'transfer' AND (to_owner = '${OPERATOR}' OR (to_owner IS NULL AND tx_signer = '${OPERATOR}')), false) AS is_in,
           COALESCE(from_owner = '${OPERATOR}' OR (from_owner IS NULL AND tx_signer = '${OPERATOR}'), false) AS is_out
    FROM tokens_solana.transfers
    WHERE block_time >= from_unixtime(${start}) AND block_time < from_unixtime(${end})
      AND action IN ('transfer', 'wrap')
      AND (to_owner = '${OPERATOR}' OR from_owner = '${OPERATOR}' OR tx_signer = '${OPERATOR}')
  ),
  launchlab_pools AS (
    SELECT account_creator AS creator, account_quote_mint AS quote_mint
    FROM raydium_solana.raydium_launchpad_call_initialize
    WHERE call_block_time >= TIMESTAMP '2026-08-21' AND call_block_time < from_unixtime(${end})
    UNION ALL
    SELECT account_creator, account_quote_mint
    FROM raydium_solana.raydium_launchpad_call_initialize_v2
    WHERE call_block_time >= TIMESTAMP '2026-08-21' AND call_block_time < from_unixtime(${end})
    UNION ALL
    SELECT account_creator, account_quote_mint
    FROM raydium_solana.raydium_launchpad_call_initialize_with_token_2022
    WHERE call_block_time >= TIMESTAMP '2026-08-21' AND call_block_time < from_unixtime(${end})
  ),
  -- Creator fees from graduated pools. The CPMM config charges them on the quote side only, and the query also
  -- excludes the migration's base vaults in case that changes.
  migrated_base_vaults AS (
    SELECT account_cpswap_base_vault AS vault
    FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap
    WHERE call_block_time >= TIMESTAMP '2026-08-21' AND call_block_time < from_unixtime(${end})
      AND account_cpswap_base_vault IS NOT NULL
  ),
  flows AS (
    SELECT *,
      -- An operator swap against a curve or CPMM pool also moves quote out of a pool vault, so the per-pool curve
      -- route and CPMM claims skip transactions where the operator paid into that program.
      COALESCE(bool_or(is_out AND program = '${LAUNCHLAB_PROGRAM}') OVER (PARTITION BY tx_id), false) AS paid_launchlab,
      COALESCE(bool_or(is_out AND program = '${CPMM_PROGRAM}') OVER (PARTITION BY tx_id), false) AS paid_cpmm,
      -- Locked-position harvests. Position NFTs also arrive from the lock program, one unit at a time.
      COALESCE(is_in AND program = '${LOCK_PROGRAM}' AND CAST(amount AS DOUBLE) > 1, false) AS is_harvest,
      -- A Jupiter swap that returned STONK to the operator is a buyback, unless it is a dev-buy: a dev-buy on a
      -- STONK-quoted launch buys STONK and spends it into the launch pool in the same bundle, so both happen in
      -- the same second.
      SUM(CASE WHEN is_in AND mint = '${STONK}' AND program = '${JUPITER}' AND to_owner = '${OPERATOR}' THEN CAST(amount AS DOUBLE) END)
        OVER (PARTITION BY tx_id) AS stonk_bought,
      MIN(CASE WHEN is_out AND out_mint = '${STONK}' AND program IN ('${CLMM_PROGRAM}', '${LAUNCHLAB_PROGRAM}', '${CPMM_PROGRAM}') THEN CAST(amount AS DOUBLE) END)
        OVER (PARTITION BY block_time) AS stonk_spent_into_pool
    FROM op
    WHERE is_in OR is_out
  ),
  -- A one-sided harvest delivers the quote. A two-sided one also delivers the launched base token, which is told
  -- apart after this query (see settleTxLegs).
  harvest_sides AS (
    SELECT *,
      COALESCE(MIN(CASE WHEN is_harvest THEN mint END) OVER (PARTITION BY tx_id)
        <> MAX(CASE WHEN is_harvest THEN mint END) OVER (PARTITION BY tx_id), false) AS two_sided
    FROM flows
  ),
  classified AS (
    SELECT tx_id, block_time, mint, out_mint, amount, amount_display, token_version, to_token_account, is_harvest, two_sided,
      CASE
        -- Curve platform fees, counted when claimed.
        WHEN is_in AND program = '${LAUNCHLAB_PROGRAM}'
          AND (from_owner = '${LAUNCHLAB_FEE_VAULT_AUTHORITY}' OR (from_owner = '${LAUNCHLAB_POOL_AUTHORITY}' AND NOT paid_launchlab))
          THEN 'Launch Curve Platform Fee'
        WHEN is_in AND program = '${CPMM_PROGRAM}' AND from_owner = '${CPMM_AUTHORITY}' AND NOT paid_cpmm
          AND from_token_account NOT IN (SELECT vault FROM migrated_base_vaults)
          THEN 'Graduated Pool Creator Fee'
        WHEN is_harvest
          THEN CASE WHEN from_token_account = '${STONK_POOL_QUOTE_VAULT}' THEN '${STONK_POOL_LABEL}' ELSE 'Locked LP Trading Fees' END
      END AS fee_label,
      -- Creator and flywheel shares as paid out: plain transfers from the operator to the flywheel wallet, or to
      -- the creator of a LaunchLab pool in one of LaunchLab's quote tokens (creators of SOL launches get native
      -- SOL). Requiring a creator wallet keeps dev-buy deliveries and Jito tips out.
      CASE
        WHEN is_out AND program IN ('${TOKEN_PROGRAM}', '${TOKEN_2022_PROGRAM}', '${SYSTEM_PROGRAM}')
          AND block_time >= from_unixtime(${PAYOUTS_FROM})
          AND from_owner = '${OPERATOR}' AND to_owner <> '${OPERATOR}'
          AND (
            (to_owner = '${FLYWHEEL_WALLET}' AND token_version <> 'native')
            OR (
              to_owner IN (SELECT creator FROM launchlab_pools WHERE creator IS NOT NULL)
              AND (token_version = 'native' OR out_mint IN (SELECT quote_mint FROM launchlab_pools WHERE quote_mint IS NOT NULL))
            )
          )
          THEN CASE WHEN to_owner = '${FLYWHEEL_WALLET}' THEN 'Flywheel Share' ELSE 'Creator Fee Share' END
      END AS payout_label,
      -- Buybacks: routes hop through the operator's own accounts and split across pools, so the amount spent is
      -- the net outflow per token in that swap. A swap that spends SOL does it from a temporary wSOL account it
      -- opens and closes. Dune may not know that account's owner or, for an unchecked transfer, its mint. Jupiter
      -- only opens such accounts for wSOL, so a missing mint is wSOL. Native SOL rows are left out because the
      -- wSOL legs already carry the amount.
      stonk_bought IS NOT NULL AND NOT COALESCE(stonk_spent_into_pool <= stonk_bought, false) AS buyback_tx,
      COALESCE(is_out AND program = '${JUPITER}' AND token_version <> 'native' AND COALESCE(out_mint, '') <> '${STONK}', false) AS swap_out,
      COALESCE(is_in AND program = '${JUPITER}' AND token_version <> 'native' AND COALESCE(mint, '') <> '${STONK}', false) AS swap_in
    FROM harvest_sides
  ),
  legs AS (
    SELECT tx_id, block_time, kind, label,
      CASE kind WHEN 'fee' THEN mint WHEN 'payout' THEN out_mint ELSE COALESCE(mint, '${WSOL}') END AS mint,
      CASE WHEN kind = 'buyback'
        THEN (CASE WHEN swap_out THEN CAST(amount AS DOUBLE) ELSE 0 END) - (CASE WHEN swap_in THEN CAST(amount AS DOUBLE) ELSE 0 END)
        ELSE CAST(amount AS DOUBLE)
      END AS amount,
      amount_display,
      COALESCE(kind = 'fee' AND is_harvest AND two_sided, false) AS split_harvest,
      COALESCE(kind = 'fee' AND token_version = 'spl_token_2022', false) AS t22,
      CASE WHEN kind = 'fee' AND token_version = 'spl_token_2022' THEN to_token_account END AS account
    FROM (
      SELECT *,
        CASE
          WHEN fee_label IS NOT NULL THEN 'fee'
          WHEN payout_label IS NOT NULL THEN 'payout'
          WHEN buyback_tx AND (swap_out OR swap_in) THEN 'buyback'
        END AS kind,
        COALESCE(fee_label, payout_label, '${BUYBACK_LABEL}') AS label
      FROM classified
    )
    WHERE kind IS NOT NULL
  ),
  per_tx AS (
    SELECT kind, label, mint, tx_id, date_trunc('hour', block_time) AS hour, split_harvest, t22, account,
           SUM(amount) AS amount, SUM(amount_display) AS display
    FROM legs
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
  )
  -- Two-sided harvests and Token-2022 fees stay per transaction for settleTxLegs; everything else is summed.
  SELECT kind, label, mint, CAST(to_unixtime(hour) AS BIGINT) AS hour,
         CASE WHEN split_harvest OR t22 THEN tx_id END AS tx_id, split_harvest AS two_sided, t22, account,
         CAST(CAST(ROUND(SUM(amount)) AS DECIMAL(38, 0)) AS VARCHAR) AS raw_amount,
         SUM(display) AS display
  FROM per_tx
  -- A buyback counts each token the swap spent on net.
  WHERE kind <> 'buyback' OR amount > 0
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
`;

// Follow-up lookups for the legs that come back per transaction. Each reads a sliver of its table, with literal
// filters so Dune can skip the rest of it:
// - created: when each token that a two-sided harvest delivered was created.
// - landed: what each Token-2022 fee claim credited the operator. A transfer-fee token credits less than the
//   transfer amount and the issuer keeps the difference (account_activity amounts are decimal adjusted).
const lookupsQuery = (mints: string[], accounts: string[], start: number, end: number) => {
  const parts: string[] = [];
  if (mints.length) parts.push(`
    SELECT 'created' AS kind, token_mint_address AS mint, CAST(to_unixtime(created_at) AS BIGINT) AS ts,
           CAST(NULL AS VARCHAR) AS tx_id, CAST(NULL AS DOUBLE) AS landed
    FROM tokens_solana.fungible
    WHERE token_mint_address IN (${sqlList(mints)})`);
  if (accounts.length) parts.push(`
    SELECT 'landed', token_mint_address, CAST(NULL AS BIGINT), tx_id, SUM(token_balance_change)
    FROM solana.account_activity
    WHERE block_time >= from_unixtime(${start}) AND block_time < from_unixtime(${end})
      AND address IN (${sqlList(accounts)})
      AND tx_success AND token_balance_owner = '${OPERATOR}'
    GROUP BY 2, 4`);
  return parts.join("\n    UNION ALL");
};

// A token counts as launched by StonkFun when the transaction that created it minted it, signed by the operator or
// run by LaunchLab, from the first launches on 2026-07-23. Reading only the creation seconds keeps this cheap.
const LAUNCHES_FROM = Date.UTC(2026, 6, 23) / 1000;
const mintedQuery = (created: Map<string, number>, end: number) => `
  SELECT token_mint_address AS mint, CAST(to_unixtime(block_time) AS BIGINT) AS ts
  FROM tokens_solana.transfers
  WHERE block_time IN (${[...new Set(created.values())].map((t) => `from_unixtime(${t})`).join(", ")})
    AND block_time < from_unixtime(${end})
    AND token_mint_address IN (${sqlList([...created.keys()])})
    AND action = 'mint'
    AND (tx_signer = '${OPERATOR}' OR outer_executing_account = '${LAUNCHLAB_PROGRAM}')
  GROUP BY 1, 2
`;

// Token-2022 mints with a transfer fee. A mint's extensions are fixed when it is created, so the current account
// answers this for any date.
const transferFeeMints = async (mints: string[]) => {
  if (!mints.length) return new Set<string>();
  const infos = await getMultipleAccounts({ chain: CHAIN.SOLANA, accounts: mints, encoding: "jsonParsed" });
  return new Set(mints.filter((_, i) => (infos[i]?.data?.parsed?.info?.extensions ?? []).some((e: any) => e.extension === "transferFeeConfig")));
};

// Drops the launched base token of two-sided harvests and scales Token-2022 fees to what landed, then sums the
// per-transaction legs like the rest.
const settleTxLegs = (rows: LegRow[], mintedAt: Map<string, number>, landed: Map<string, number>): Leg[] => {
  // In a two-sided harvest the base is the token StonkFun launched, and when both are launches the quote is the
  // older one.
  const harvestMints = new Map<string, Set<string>>();
  for (const r of rows) if (r.two_sided && r.mint) harvestMints.set(r.tx_id!, (harvestMints.get(r.tx_id!) ?? new Set<string>()).add(r.mint));
  const isBase = (r: LegRow) => {
    const own = mintedAt.get(r.mint);
    if (!r.two_sided || own === undefined) return false;
    return [...harvestMints.get(r.tx_id!)!].some((m) => m !== r.mint && (mintedAt.get(m) ?? -Infinity) < own);
  };
  const kept = rows.filter((r) => !isBase(r));

  const gross = new Map<string, number>();
  for (const r of kept) gross.set(`${r.tx_id}|${r.mint}`, (gross.get(`${r.tx_id}|${r.mint}`) ?? 0) + Number(r.display));

  const legs = new Map<string, { leg: Leg; amount: number }>();
  for (const r of kept) {
    const got = landed.get(`${r.tx_id}|${r.mint}`);
    const sent = gross.get(`${r.tx_id}|${r.mint}`)!;
    const factor = r.t22 && got !== undefined && got > 0 && got < sent ? got / sent : 1;
    const key = `${r.label}|${r.mint}|${r.hour}`;
    const entry = legs.get(key) ?? { leg: { kind: "fee", label: r.label, mint: r.mint, hour: r.hour, raw_amount: "0" }, amount: 0 };
    entry.amount += Number(r.raw_amount) * factor;
    legs.set(key, entry);
  }
  return [...legs.values()].map(({ leg, amount }) => ({ ...leg, raw_amount: BigInt(Math.round(amount)).toString() }));
};

// USD and raw units traded per token and hour. Prices are USD per raw unit, so token decimals and scaled-UI
// multipliers never come into it.
const tradesQuery = (mints: string[], start: number, end: number) => {
  const list = mints.map((m) => `'${m}'`).join(", ");
  return `
  WITH trades AS (
    SELECT token_bought_mint_address AS mint, CAST(token_bought_amount_raw AS DOUBLE) AS raw, amount_usd, block_time
    FROM dex_solana.trades
    WHERE block_time >= from_unixtime(${start}) AND block_time < from_unixtime(${end})
      AND token_bought_mint_address IN (${list})
      AND amount_usd > 0 AND CAST(token_bought_amount_raw AS DOUBLE) > 0
    UNION ALL
    SELECT token_sold_mint_address AS mint, CAST(token_sold_amount_raw AS DOUBLE) AS raw, amount_usd, block_time
    FROM dex_solana.trades
    WHERE block_time >= from_unixtime(${start}) AND block_time < from_unixtime(${end})
      AND token_sold_mint_address IN (${list})
      AND amount_usd > 0 AND CAST(token_sold_amount_raw AS DOUBLE) > 0
  ),
  priced AS (
    SELECT mint, raw, amount_usd, block_time, amount_usd / raw AS px,
           approx_percentile(amount_usd / raw, 0.5) OVER (PARTITION BY mint) AS median_px
    FROM trades
  )
  SELECT mint, CAST(to_unixtime(date_trunc('hour', block_time)) AS BIGINT) AS hour, SUM(amount_usd) AS usd, SUM(raw) AS raw
  FROM priced
  WHERE px BETWEEN median_px / ${MAX_PRICE_DEVIATION} AND median_px * ${MAX_PRICE_DEVIATION}
  GROUP BY 1, 2
`;
};

const sumByMint = (rows: TradeSum[]) => {
  const totals = new Map<string, { usd: number; raw: number }>();
  for (const r of rows) {
    const t = totals.get(r.mint) ?? { usd: 0, raw: 0 };
    t.usd += Number(r.usd);
    t.raw += Number(r.raw);
    totals.set(r.mint, t);
  }
  return new Map([...totals].map(([mint, t]) => [mint, t.usd / t.raw]));
};

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  // startTimestamp is one second before midnight. Querying the UTC day keeps that second from counting twice.
  const start = options.startOfDay;
  const end = options.endTimestamp;
  // One key per day, so Dune's bulk mode can't merge several days' legs into a query too complex for Dune.
  const legRows = (await queryDuneSql(options, legsQuery(start, end), { extraUIDKey: `stonkfun-legs-${start}` })) as LegRow[];
  const txRows = legRows.filter((r) => r.tx_id);
  const harvestMints = [...new Set(txRows.filter((r) => r.two_sided && r.mint).map((r) => r.mint))];
  const feeMints = await transferFeeMints([...new Set(txRows.filter((r) => r.t22).map((r) => r.mint))]);
  const accounts = [...new Set(txRows.filter((r) => r.t22 && feeMints.has(r.mint) && r.account).map((r) => r.account!))];
  const lookups = harvestMints.length || accounts.length
    ? ((await queryDuneSql(options, lookupsQuery(harvestMints, accounts, start, end), { extraUIDKey: `stonkfun-lookups-${start}` })) as Lookup[])
    : [];
  const created = new Map(lookups.filter((l) => l.kind === "created" && Number(l.ts) >= LAUNCHES_FROM).map((l) => [l.mint, Number(l.ts)]));
  const mintedRows = created.size
    ? ((await queryDuneSql(options, mintedQuery(created, end), { extraUIDKey: `stonkfun-minted-${start}` })) as { mint: string; ts: number }[])
    : [];
  const mintedAt = new Map(mintedRows.filter((m) => created.get(m.mint) === Number(m.ts)).map((m) => [m.mint, Number(m.ts)]));
  const landed = new Map(lookups.filter((l) => l.kind === "landed").map((l) => [`${l.tx_id}|${l.mint}`, Number(l.landed)]));
  const legs: Leg[] = [...legRows.filter((r) => !r.tx_id), ...settleTxLegs(txRows, mintedAt, landed)];

  const mints = [...new Set(legs.map((l) => l.mint).filter(Boolean))];
  const dayTrades = mints.length
    ? ((await queryDuneSql(options, tradesQuery(mints, start, end), { extraUIDKey: `stonkfun-prices-${start}` })) as TradeSum[])
    : [];
  const hourPx = new Map<string, number>();
  for (const t of dayTrades) if (Number(t.usd) >= MIN_HOUR_USD) hourPx.set(`${t.mint}|${t.hour}`, Number(t.usd) / Number(t.raw));
  const dayPx = sumByMint(dayTrades);
  const stale = mints.filter((m) => !dayPx.has(m));
  const weekPx = stale.length
    ? sumByMint((await queryDuneSql(options, tradesQuery(stale, start - PRICE_LOOKBACK_SECONDS, start), { extraUIDKey: `stonkfun-stale-prices-${start}` })) as TradeSum[])
    : new Map<string, number>();

  // A token gets a price for every leg or for none, because any hour price implies a day price.
  const rows = new Map<string, { kind: Leg["kind"]; label: string; mint: string; raw: bigint; usd: number | null }>();
  for (const leg of legs) {
    const key = `${leg.kind}|${leg.label}|${leg.mint}`;
    const row = rows.get(key) ?? { kind: leg.kind, label: leg.label, mint: leg.mint, raw: 0n, usd: 0 };
    const px = hourPx.get(`${leg.mint}|${leg.hour}`) ?? dayPx.get(leg.mint) ?? weekPx.get(leg.mint);
    row.raw += BigInt(leg.raw_amount || 0);
    row.usd = px === undefined || row.usd === null ? null : row.usd + Number(leg.raw_amount || 0) * px;
    rows.set(key, row);
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const stonkExcluded = options.startOfDay >= STONK_REVENUE_EXCLUDED_FROM;

  for (const row of rows.values()) {
    const raw = row.raw;
    if (raw <= 0n) continue;
    // Tokens with no Dune trades that day or the week before fall back to DefiLlama's own price.
    const usd = row.usd;
    const credit = (balances: typeof dailyFees, label: string) =>
      usd === null ? balances.add(row.mint, raw, label) : balances.addUSDValue(usd, label);
    const debit = (balances: typeof dailyFees, label: string) =>
      usd === null ? balances.subtractToken(row.mint, raw, label) : balances.addUSDValue(-usd, label);

    if (row.kind === "fee") {
      const stonkFee = row.mint === STONK || row.label === STONK_POOL_LABEL;
      const label = row.label === STONK_POOL_LABEL ? "Locked LP Trading Fees" : row.label;
      credit(dailyFees, label);
      if (!(stonkExcluded && stonkFee)) credit(dailyRevenue, label);
    } else if (row.kind === "payout") {
      credit(dailySupplySideRevenue, row.label);
      // A STONK payout comes out of STONK fees, which are already outside revenue.
      if (!(stonkExcluded && row.mint === STONK)) debit(dailyRevenue, row.label);
    } else if (row.kind === "buyback") {
      credit(dailyHoldersRevenue, BUYBACK_LABEL);
    }
  }

  // One label, so the buyback nets into retained fees instead of a separate negative row. It goes negative when a
  // buyback spends income claimed on earlier days.
  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addBalances(dailyRevenue, PROTOCOL_REVENUE_LABEL);
  dailyProtocolRevenue.subtract(dailyHoldersRevenue, PROTOCOL_REVENUE_LABEL);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "Trading fees StonkFun collects, measured when it claims them: the 1% platform fee on its Raydium LaunchLab bonding curves (every platform config whose fees it claims), the creator fee on the Raydium CPMM pools those launches graduate into, and the quote side of fees harvested from the permanently locked liquidity behind pre-LaunchLab launches. Raydium's own fee shares are excluded. Each token is valued with Dune trade prices at the hour it was received, ignoring trades priced more than 10x away from that day's median.",
  UserFees: "Same as fees.",
  Revenue: "Fees less the creator share of standard launches and the flywheel share of reward launches, as paid out on-chain. From 2026-08-28, fees paid in STONK and fees from STONK's own pool are excluded: they cannot fund a STONK buyback.",
  SupplySideRevenue: "Creator and flywheel shares of fees, measured when they are paid out.",
  HoldersRevenue: "Quote assets spent buying STONK on Jupiter, identified on-chain as swaps that returned STONK to the operator wallet, at the net amount each swap spent.",
  ProtocolRevenue: "Fees StonkFun keeps after paying the creator share of standard launches and the flywheel share of reward launches, minus the quote assets spent buying STONK on Jupiter. From 2026-08-28, fees paid in STONK and fees from STONK's own pool are excluded. Buybacks spend income claimed on earlier days, so this is negative when a buyback is larger than the day's retained fees.",
};

const breakdownMethodology = {
  Fees: {
    "Launch Curve Platform Fee": "1% of every LaunchLab bonding curve trade, claimed from the platform fee vaults in each pool's quote token.",
    "Graduated Pool Creator Fee": "Creator fee on swaps in the CPMM pools graduated launches migrate into, claimed by StonkFun as pool creator; quote side only.",
    "Locked LP Trading Fees": "Quote-token fees harvested from the permanently locked launch positions.",
  },
  UserFees: {
    "Launch Curve Platform Fee": "1% of every LaunchLab bonding curve trade, claimed from the platform fee vaults in each pool's quote token.",
    "Graduated Pool Creator Fee": "Creator fee on swaps in the CPMM pools graduated launches migrate into, claimed by StonkFun as pool creator; quote side only.",
    "Locked LP Trading Fees": "Quote-token fees harvested from the permanently locked launch positions.",
  },
  Revenue: {
    "Launch Curve Platform Fee": "Platform fees claimed by StonkFun.",
    "Graduated Pool Creator Fee": "Creator fees claimed from graduated pools.",
    "Locked LP Trading Fees": "Quote-token fees retained by the protocol.",
    "Creator Fee Share": "Deducted: the creator share paid out to launch creators.",
    "Flywheel Share": "Deducted: the flywheel share paid out to the flywheel wallet.",
  },
  SupplySideRevenue: {
    "Creator Fee Share": "Creator share of standard-launch fees, paid to each launch's creator wallet.",
    "Flywheel Share": "Flywheel share of reward-launch fees, paid to the flywheel wallet.",
  },
  ProtocolRevenue: {
    [PROTOCOL_REVENUE_LABEL]: "Fees kept after creator and flywheel payouts, minus quote assets spent buying STONK. Negative when a buyback spends income claimed on earlier days.",
  },
  HoldersRevenue: {
    [BUYBACK_LABEL]: "Revenue spent buying the platform token back and burning it.",
  },
};

const adapter: Adapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // LaunchLab and Raydium report the same swap fees.
  allowNegativeValue: true, // A creator or flywheel payout backlog, or a STONK buyback of fees claimed earlier, can exceed that day's fees.
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.SOLANA]: { fetch, start: "2026-07-25" },
  },
};

export default adapter;
