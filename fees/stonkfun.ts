import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";

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
const WSOL = "So11111111111111111111111111111111111111112";

// Each leg is priced from Dune trades in its hour, falling back to the whole day and then the week before.
// An hour price needs at least $100 of trades. Pricing ignores trades more than 10x away from the token's
// median trade price in the window, so one off-market trade in a thin pool can't set a whole day's price.
const PRICE_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;
const MIN_HOUR_USD = 100;
const MAX_PRICE_DEVIATION = 10;

const STONK_POOL_LABEL = "STONK Pool";
const BUYBACK_LABEL = "STONK Buyback And Burn";

type Leg = { kind: "fee" | "payout" | "buyback"; label: string; mint: string; hour: number; raw_amount: string };
type TradeSum = { mint: string; hour: number; usd: number; raw: number };

// Dune rejects the legs and their pricing as a single query (too many stages), so prices come from a second
// query over the day's mints.
const legsQuery = (start: number, end: number) => `
  WITH
  -- Transfers into and out of the operator wallet. Dune's account table may have no owner for a token account
  -- opened and closed inside one transaction (temporary wSOL). If the operator signed that transaction, the
  -- account is the operator's, so these rows keep a NULL owner and each step below decides whether to use them.
  op_in AS (
    SELECT tx_id, block_time, outer_executing_account AS program, token_mint_address AS mint,
           amount, amount_display, token_version, from_owner, from_token_account, to_owner
    FROM tokens_solana.transfers
    WHERE block_time >= from_unixtime(${start}) AND block_time < from_unixtime(${end})
      AND action = 'transfer'
      AND (to_owner = '${OPERATOR}' OR (to_owner IS NULL AND tx_signer = '${OPERATOR}'))
  ),
  -- token_version identifies native SOL rows, because Dune publishes their mint both as the wSOL mint and as
  -- ${NATIVE_SOL}. Dune labels a native transfer into a token account it knows as 'wrap'.
  op_out AS (
    SELECT tx_id, block_time, outer_executing_account AS program,
           CASE WHEN token_version = 'native' THEN '${WSOL}' ELSE token_mint_address END AS mint,
           token_version = 'native' AS native, amount, from_owner, from_token_account, to_owner, to_token_account
    FROM tokens_solana.transfers
    WHERE block_time >= from_unixtime(${start}) AND block_time < from_unixtime(${end})
      AND action IN ('transfer', 'wrap')
      AND (from_owner = '${OPERATOR}' OR (from_owner IS NULL AND tx_signer = '${OPERATOR}'))
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
  -- Curve platform fees, counted when claimed. An operator swap against a curve pool also moves quote out of a
  -- pool vault, so the per-pool route skips transactions where the operator paid into LaunchLab.
  curve_claims AS (
    SELECT tx_id, block_time, mint, amount, amount_display, token_version, 'Launch Curve Platform Fee' AS label
    FROM op_in
    WHERE program = '${LAUNCHLAB_PROGRAM}'
      AND (
        from_owner = '${LAUNCHLAB_FEE_VAULT_AUTHORITY}'
        OR (
          from_owner = '${LAUNCHLAB_POOL_AUTHORITY}'
          AND tx_id NOT IN (SELECT tx_id FROM op_out WHERE program = '${LAUNCHLAB_PROGRAM}')
        )
      )
  ),
  -- Creator fees from graduated pools. The CPMM config charges them on the quote side only, and the query also
  -- excludes the migration's base vaults in case that changes. Operator swaps through CPMM are skipped as above.
  migrated_base_vaults AS (
    SELECT account_cpswap_base_vault AS vault
    FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap
    WHERE call_block_time >= TIMESTAMP '2026-08-21' AND call_block_time < from_unixtime(${end})
      AND account_cpswap_base_vault IS NOT NULL
  ),
  cpmm_claims AS (
    SELECT tx_id, block_time, mint, amount, amount_display, token_version, 'Graduated Pool Creator Fee' AS label
    FROM op_in
    WHERE program = '${CPMM_PROGRAM}' AND from_owner = '${CPMM_AUTHORITY}'
      AND from_token_account NOT IN (SELECT vault FROM migrated_base_vaults)
      AND tx_id NOT IN (SELECT tx_id FROM op_out WHERE program = '${CPMM_PROGRAM}')
  ),
  -- Locked-position harvests. Position NFTs also arrive from the lock program, one unit at a time.
  harvest_legs AS (
    SELECT tx_id, block_time, mint, amount, amount_display, token_version, from_token_account AS vault
    FROM op_in
    WHERE program = '${LOCK_PROGRAM}' AND CAST(amount AS DOUBLE) > 1
  ),
  harvest_sides AS (
    SELECT tx_id, COUNT(DISTINCT mint) AS sides FROM harvest_legs GROUP BY 1
  ),
  -- A one-sided delivery is the quote. In a two-sided one the base is the token StonkFun launched (minted by
  -- the operator, or by LaunchLab), and when both are launches the quote is the older one.
  minted AS (
    SELECT token_mint_address AS mint, MIN(block_time) AS minted_at
    FROM tokens_solana.transfers
    WHERE block_time >= TIMESTAMP '2026-07-23' AND block_time < from_unixtime(${end})
      AND action = 'mint'
      AND (tx_signer = '${OPERATOR}' OR outer_executing_account = '${LAUNCHLAB_PROGRAM}')
      AND token_mint_address IN (
        SELECT l.mint FROM harvest_legs l JOIN harvest_sides s ON s.tx_id = l.tx_id WHERE s.sides > 1
      )
    GROUP BY 1
  ),
  harvest_base AS (
    SELECT DISTINCT l.tx_id, l.mint
    FROM harvest_legs l
    JOIN minted m ON m.mint = l.mint
    JOIN harvest_legs o ON o.tx_id = l.tx_id AND o.mint <> l.mint
    LEFT JOIN minted om ON om.mint = o.mint
    WHERE om.mint IS NULL OR om.minted_at < m.minted_at
  ),
  harvest_quotes AS (
    SELECT l.tx_id, l.block_time, l.mint, l.amount, l.amount_display, l.token_version,
           CASE WHEN l.vault = '${STONK_POOL_QUOTE_VAULT}' THEN '${STONK_POOL_LABEL}' ELSE 'Locked LP Trading Fees' END AS label
    FROM harvest_legs l
    LEFT JOIN harvest_base b ON b.tx_id = l.tx_id AND b.mint = l.mint
    WHERE b.mint IS NULL
  ),
  fee_legs AS (
    SELECT tx_id, block_time, mint, amount, amount_display, token_version, label FROM curve_claims
    UNION ALL
    SELECT tx_id, block_time, mint, amount, amount_display, token_version, label FROM cpmm_claims
    UNION ALL
    SELECT tx_id, block_time, mint, amount, amount_display, token_version, label FROM harvest_quotes
  ),
  -- A Token-2022 quote with a transfer fee credits less than the transfer amount, and the issuer keeps the
  -- difference. Those legs are scaled to what landed (account_activity amounts are decimal adjusted).
  landed AS (
    SELECT a.tx_id, a.token_mint_address AS mint, SUM(a.token_balance_change) AS landed_display
    FROM solana.account_activity a
    WHERE a.block_time >= from_unixtime(${start}) AND a.block_time < from_unixtime(${end})
      AND a.tx_success AND a.token_balance_owner = '${OPERATOR}'
      AND a.tx_id IN (SELECT tx_id FROM fee_legs WHERE token_version = 'spl_token_2022')
    GROUP BY 1, 2
  ),
  fee_tx AS (
    SELECT tx_id, mint, SUM(amount_display) AS gross_display FROM fee_legs GROUP BY 1, 2
  ),
  fees AS (
    SELECT f.tx_id, f.block_time, f.mint, f.label,
           CAST(f.amount AS DOUBLE) * CASE
             WHEN f.token_version = 'spl_token_2022' AND n.landed_display > 0 AND n.landed_display < t.gross_display
             THEN n.landed_display / t.gross_display
             ELSE 1
           END AS amount
    FROM fee_legs f
    JOIN fee_tx t ON t.tx_id = f.tx_id AND t.mint = f.mint
    LEFT JOIN landed n ON n.tx_id = f.tx_id AND n.mint = f.mint
  ),
  -- Creator and flywheel shares as paid out: plain transfers from the operator to the flywheel wallet, or to
  -- the creator of a LaunchLab pool in one of LaunchLab's quote tokens (creators of SOL launches get native
  -- SOL). Requiring a creator wallet keeps dev-buy deliveries and Jito tips out.
  payouts AS (
    SELECT o.tx_id, o.block_time, o.mint, CAST(o.amount AS DOUBLE) AS amount,
           CASE WHEN o.to_owner = '${FLYWHEEL_WALLET}' THEN 'Flywheel Share' ELSE 'Creator Fee Share' END AS label
    FROM op_out o
    WHERE o.program IN ('${TOKEN_PROGRAM}', '${TOKEN_2022_PROGRAM}', '${SYSTEM_PROGRAM}')
      AND o.block_time >= from_unixtime(${PAYOUTS_FROM})
      AND o.from_owner = '${OPERATOR}' AND o.to_owner <> '${OPERATOR}'
      AND (
        (o.to_owner = '${FLYWHEEL_WALLET}' AND NOT o.native)
        OR (
          o.to_owner IN (SELECT creator FROM launchlab_pools WHERE creator IS NOT NULL)
          AND (o.native OR o.mint IN (SELECT quote_mint FROM launchlab_pools WHERE quote_mint IS NOT NULL))
        )
      )
  ),
  -- Buybacks: Jupiter swaps that returned STONK to the operator. Routes hop through the operator's own
  -- accounts and split across pools, so the amount spent is the net outflow per token in that swap.
  stonk_bought AS (
    SELECT tx_id, MIN(block_time) AS block_time, SUM(CAST(amount AS DOUBLE)) AS received
    FROM op_in
    WHERE mint = '${STONK}' AND program = '${JUPITER}' AND to_owner = '${OPERATOR}'
    GROUP BY 1
  ),
  -- A dev-buy on a STONK-quoted launch buys STONK and spends it into the launch pool in the same bundle, so
  -- both happen in the same second. Those swaps are not buybacks.
  dev_buy_swaps AS (
    SELECT DISTINCT b.tx_id
    FROM stonk_bought b
    JOIN op_out p
      ON p.block_time = b.block_time
     AND p.mint = '${STONK}'
     AND p.program IN ('${CLMM_PROGRAM}', '${LAUNCHLAB_PROGRAM}', '${CPMM_PROGRAM}')
     AND CAST(p.amount AS DOUBLE) <= b.received
  ),
  buyback_txs AS (
    SELECT tx_id FROM stonk_bought WHERE tx_id NOT IN (SELECT tx_id FROM dev_buy_swaps)
  ),
  -- A swap that spends SOL does it from a temporary wSOL account it opens and closes. Dune may not know that
  -- account's owner (op_in and op_out keep the row with a NULL owner because the operator signed) or, for an
  -- unchecked transfer, its mint. Jupiter only opens such accounts for wSOL, so a missing mint is wSOL.
  -- Native SOL rows are left out because the wSOL legs already carry the amount.
  buyback_flows AS (
    SELECT tx_id, block_time, COALESCE(mint, '${WSOL}') AS mint, CAST(amount AS DOUBLE) AS flow
    FROM op_out
    WHERE program = '${JUPITER}' AND NOT native AND COALESCE(mint, '') <> '${STONK}'
      AND tx_id IN (SELECT tx_id FROM buyback_txs)
    UNION ALL
    SELECT tx_id, block_time, COALESCE(mint, '${WSOL}') AS mint, -CAST(amount AS DOUBLE) AS flow
    FROM op_in
    WHERE program = '${JUPITER}' AND token_version <> 'native' AND COALESCE(mint, '') <> '${STONK}'
      AND tx_id IN (SELECT tx_id FROM buyback_txs)
  ),
  buybacks AS (
    SELECT tx_id, MIN(block_time) AS block_time, mint, SUM(flow) AS amount
    FROM buyback_flows
    GROUP BY tx_id, mint
    HAVING SUM(flow) > 0
  ),
  legs AS (
    SELECT 'fee' AS kind, label, mint, block_time, amount FROM fees
    UNION ALL
    SELECT 'payout' AS kind, label, mint, block_time, amount FROM payouts
    UNION ALL
    SELECT 'buyback' AS kind, '${BUYBACK_LABEL}' AS label, mint, block_time, amount FROM buybacks
  )
  SELECT kind, label, mint, CAST(to_unixtime(date_trunc('hour', block_time)) AS BIGINT) AS hour,
         CAST(CAST(ROUND(SUM(amount)) AS DECIMAL(38, 0)) AS VARCHAR) AS raw_amount
  FROM legs
  GROUP BY 1, 2, 3, 4
`;

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
  const legs = (await queryDuneSql(options, legsQuery(start, end), { extraUIDKey: `stonkfun-legs-${start}` })) as Leg[];

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

  // There is no dailyProtocolRevenue. Buybacks spend income claimed on earlier days, so one day's revenue minus
  // holders revenue can go negative, and a capped figure would be invented rather than measured.
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "Trading fees StonkFun collects, measured when it claims them: the 1% platform fee on its Raydium LaunchLab bonding curves (every platform config whose fees it claims), the creator fee on the Raydium CPMM pools those launches graduate into, and the quote side of fees harvested from the permanently locked liquidity behind pre-LaunchLab launches. Raydium's own fee shares are excluded. Each token is valued with Dune trade prices at the hour it was received, ignoring trades priced more than 10x away from that day's median.",
  UserFees: "Same as fees.",
  Revenue: "Fees less the creator share of standard launches and the flywheel share of reward launches, as paid out on-chain. From 2026-08-28, fees paid in STONK and fees from STONK's own pool are excluded: they cannot fund a STONK buyback.",
  SupplySideRevenue: "Creator and flywheel shares of fees, measured when they are paid out.",
  HoldersRevenue: "Quote assets spent buying STONK on Jupiter, identified on-chain as swaps that returned STONK to the operator wallet, at the net amount each swap spent.",
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
  HoldersRevenue: {
    [BUYBACK_LABEL]: "Revenue spent buying the platform token back and burning it.",
  },
};

const adapter: Adapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // LaunchLab and Raydium report the same swap fees.
  allowNegativeValue: true, // A creator or flywheel payout backlog paid out on a quiet day can exceed that day's fees.
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.SOLANA]: { fetch, start: "2026-07-25" },
  },
};

export default adapter;
