import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';
import { METRIC } from '../helpers/metrics';

/**
 * user.fun, a Solana launchpad built on Meteora's Dynamic Bonding Curve.
 *
 * WHAT IDENTIFIES THIS LAUNCHPAD ON CHAIN
 *
 * One immutable DBC partner config account. Every user.fun coin is created
 * against it, it is the account that fixes the fee rate and the partner/creator
 * split, and it is the account that decides where the partner side of every fee
 * lands. Fee attribution follows the config, so the config is the key.
 *
 * The two nearby adapters in this repository key differently and neither method
 * works here, which is worth stating so a reviewer does not have to guess:
 *
 *   fees/orynth.ts keys on `account_creator` of the pool initialization. On
 *   user.fun that account is the wallet of the person who made the coin. The
 *   create transaction is built for, paid by and signed by the visitor's own
 *   wallet, so there is no platform address in that position to filter on.
 *
 *   helpers/queries/bags.sql keys on `call_tx_signer` for the same instruction.
 *   Same problem: the signer is the visitor.
 *
 * A third tempting key is the mint address. Every user.fun mint is vanity
 * ground to end in "user", and that is not exclusive: mints ending in "user"
 * exist on Solana that have nothing to do with this launchpad. It is not used.
 *
 * WHAT THE FEE WATERFALL LOOKS LIKE
 *
 * The config charges a flat 1.50% of the quote side of every trade, with no fee
 * scheduler, no dynamic fee component and no rate limiter, so one rate covers
 * every trade of a pool's whole life. That 1.50% splits as:
 *
 *   0.30%  Meteora's protocol share, taken off the top (20% of the gross fee).
 *          Of that, a fifth is handed back to whichever interface hosted the
 *          swap and passed a referral account. The event reports the two legs
 *          separately as `protocol_fee` and `referral_fee`.
 *   1.20%  what is left, which is the only part the curve accumulates into
 *          `PoolMetrics.totalTradingQuoteFee`, and which the program splits by
 *          the config's whole-percent `creatorTradingFeePercentage`:
 *            0.30%  the coin creator's share (25% of 1.20%)
 *            0.90%  the user.fun partner share (the remainder)
 *
 * The identity that keeps this honest, verified on chain rather than assumed:
 * for one DBC swap the total the trader paid is
 * `trading_fee + protocol_fee + referral_fee`, and that equals the swap event's
 * `included_fee_input_amount - excluded_fee_input_amount` exactly.
 *
 * WHAT THIS ADAPTER COUNTS AS REVENUE, AND WHAT IT REFUSES TO
 *
 * Revenue is the partner share alone. Two legs that a looser adapter would
 * claim are deliberately left out of revenue, both of which mean this reads
 * low rather than high:
 *
 *   `referral_fee` is paid to whoever hosted the swap. user.fun passes its own
 *   referral account for trades made on user.fun, so some of this leg really is
 *   ours, but a trade routed through an aggregator passes somebody else's
 *   account or none at all. The `EvtSwap` event carries only a `has_referral`
 *   flag and not the account, so the two cannot be told apart from the event
 *   table this adapter reads. That is a limit of this table rather than a limit
 *   in principle: our referral account is a fixed known address, and the `swap`
 *   instruction itself takes a `referral_token_account`, which the decoded call
 *   table for that instruction carries as a column. Attributing our own share
 *   would mean joining that call table swap by swap, a heavier query whose
 *   result nobody downstream could check against the event totals, so this
 *   adapter does not make the claim. None of the leg is counted as revenue. It
 *   stays in Fees, because the trader paid it, under its own metric.
 *
 *   Declining it is why the rate published here is not the rate user.fun
 *   publishes for itself. The approved config payload records
 *   `userFunEffectiveFeeBps` 96, and that 0.96% is the 0.90% partner share plus
 *   the 0.06% referral leg the product earns only on trades it hosts itself.
 *   Revenue here is 0.90%. The difference is exactly that leg and nothing else.
 *
 *   Post-migration DAMM v2 trading is not counted at all. When a coin graduates,
 *   its later fees are recorded by a different program against a pool this
 *   query never sees. No user.fun coin has graduated yet, so this leg is empty
 *   today rather than missing, but it will have to be added when one does. See
 *   the README beside this file for what that costs.
 *
 * The creator share is reported as supply-side revenue: on this launchpad the
 * coin creator is the party being paid for supplying the asset, and that money
 * is theirs rather than the platform's.
 */

const DBC_CONFIG = '7qxdCzkwzMBZBZ9koqvC7ZSWTAavnxSxQfvnGBphb3s';
const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
/**
 * Wrapped SOL, the quote mint the config above is created against. It is only a
 * fallback: the query reads the quote mint out of the pool initialization and
 * uses this when that lookup finds nothing. A wrong value here does not read
 * low the way the omissions above do, it prices lamport counts against the
 * wrong asset, so the test beside this file holds it to this repository's own
 * WSOL constant.
 */
const QUOTE_MINT_DEFAULT = 'So11111111111111111111111111111111111111112';

/**
 * `creatorTradingFeePercentage` on the config above, read from chain. It is a
 * whole percent, which is the only thing the program accepts, and it is fixed
 * for the life of the config because the config is immutable.
 */
const CREATOR_TRADING_FEE_PERCENTAGE = 25;

const metrics = {
  PlatformFees: METRIC.TRADING_FEES,
  CreatorFees: METRIC.CREATOR_FEES,
  ProtocolFees: 'Protocol Fees to Meteora',
  ReferralFees: 'Referral Fees',
};

/**
 * One row per quote mint, holding the three fee legs the DBC swap event carries.
 *
 * The quote mint is read from the pool initialization rather than assumed,
 * because it is what DefiLlama prices the lamport counts with. It is resolved
 * once as a scalar rather than joined per swap: the config fixes a single quote
 * mint for every pool on it, and a scalar cannot fan a swap row out into two.
 * If the initialization table has nothing for this config the scalar is null
 * and the default takes over, so a decoder gap cannot silently drop fees.
 *
 * `evt_executing_account` is pinned to the curve program so a decoded row from
 * some other program that happens to carry a matching config column can never
 * enter the sum.
 */
const curveFeesSQL = `
    WITH
    launchpad_quote_mint AS (
        SELECT MIN(account_quote_mint) AS quote_mint
        FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
        WHERE account_config = '{{config}}'
    ),
    curve_swaps AS (
        SELECT
            COALESCE(q.quote_mint, '{{quoteMint}}') AS quote_mint,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
        CROSS JOIN launchpad_quote_mint q
        WHERE s.config = '{{config}}'
          AND s.evt_executing_account = '{{program}}'
          AND s.evt_block_time >= from_unixtime({{start}})
          AND s.evt_block_time <  from_unixtime({{end}})
    )
    SELECT
        quote_mint,
        -- The curve program floors the creator share on every individual swap,
        -- so the day's creator fee is the sum of those floors and not the floor
        -- of the sum. Splitting here keeps each swap's rounding intact; doing it
        -- after the SUM would hand the creator up to one lamport per swap that
        -- the chain never paid. splitCurveTradingFee below is the same rule in
        -- TypeScript and is what the adapter's test pins.
        SUM(FLOOR(COALESCE(trading_fee, 0) * {{creatorPercentage}} / 100)) AS creator_fee,
        SUM(
            COALESCE(trading_fee, 0)
            - FLOOR(COALESCE(trading_fee, 0) * {{creatorPercentage}} / 100)
        ) AS platform_fee,
        SUM(COALESCE(protocol_fee, 0)) AS protocol_fee,
        SUM(COALESCE(referral_fee, 0)) AS referral_fee
    FROM curve_swaps
    GROUP BY quote_mint
`;

const getSqlFromString = (sql: string, variables: Record<string, any> = {}): string => {
  Object.entries(variables).forEach(([key, value]) => {
    sql = sql.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  });
  return sql;
};

type CurveFeeRow = {
  quote_mint: string;
  creator_fee: number;
  platform_fee: number;
  protocol_fee: number;
  referral_fee: number;
};

type CurveFeeSplit = {
  creatorFee: number;
  platformFee: number;
};

/**
 * The split of one row's curve trading fee into the coin creator's share and
 * the user.fun partner share. This is the whole of the arithmetic this adapter
 * performs on the numbers Dune hands it, so it is exported rather than inlined:
 * a caller can exercise it directly instead of inferring it from the rows
 * `fetch` produces.
 *
 * The program floors the creator's cut per swap and hands the partner the
 * remainder, so an odd lamport lands on the platform side. Applying that floor
 * once to a day's total is not the same as summing the per-swap results: it
 * loses under one lamport per swap, always off the platform side, so this
 * understates revenue rather than flattering it.
 */
export const splitCurveTradingFee = (tradingFee: number): CurveFeeSplit => {
  const creatorFee = Math.floor((tradingFee * CREATOR_TRADING_FEE_PERCENTAGE) / 100);
  const platformFee = tradingFee - creatorFee;
  return { creatorFee, platformFee };
};

const fetch = async (options: FetchOptions) => {
  const query = getSqlFromString(curveFeesSQL, {
    config: DBC_CONFIG,
    program: DBC_PROGRAM,
    quoteMint: QUOTE_MINT_DEFAULT,
    creatorPercentage: CREATOR_TRADING_FEE_PERCENTAGE,
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  const rows: CurveFeeRow[] = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  rows.forEach((row) => {
    const creatorFee = Number(row.creator_fee ?? 0);
    const platformFee = Number(row.platform_fee ?? 0);
    const protocolFee = Number(row.protocol_fee ?? 0);
    const referralFee = Number(row.referral_fee ?? 0);

    dailyFees.add(row.quote_mint, platformFee, metrics.PlatformFees);
    dailyFees.add(row.quote_mint, creatorFee, metrics.CreatorFees);
    dailyFees.add(row.quote_mint, protocolFee, metrics.ProtocolFees);
    dailyFees.add(row.quote_mint, referralFee, metrics.ReferralFees);

    dailyRevenue.add(row.quote_mint, platformFee, metrics.PlatformFees);

    // Everything user.fun does not keep is somebody else's cut, so it all sits
    // on the supply side and dailyFees = dailyRevenue + dailySupplySideRevenue
    // holds. The creator is paid by the curve program; Meteora's protocol share
    // and the referral leg it hands to whichever interface hosted the swap are
    // taken off the top before the curve accumulates anything.
    dailySupplySideRevenue.add(row.quote_mint, creatorFee, metrics.CreatorFees);
    dailySupplySideRevenue.add(row.quote_mint, protocolFee, metrics.ProtocolFees);
    dailySupplySideRevenue.add(row.quote_mint, referralFee, metrics.ReferralFees);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  // Dune queries run once a day. A version 2 adapter runs hourly and would
  // re-run this same query twenty four times for one day of fees.
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  // The day the DBC config was created on Mainnet, in UTC. Sourced rather than
  // asserted: this repository pins that account's creation transaction, its
  // slot and its finalized block time of 1785512913 seconds, which is
  // 2026-07-31T15:48:33Z. The test beside this file recomputes this date from
  // that constant. No user.fun pool, and so no user.fun fee, can exist before
  // the account that every pool is created against.
  start: '2026-07-31',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "1.50% of every bonding curve trade, charged on the quote side. Covers all four legs the curve program reports: the user.fun partner share, the coin creator share, Meteora's protocol share and the referral share paid to whichever interface hosted the swap.",
    UserFees: 'The same 1.50%. It is the whole of what a trader pays on a user.fun trade.',
    Revenue:
      "The user.fun partner share only, which is 0.90% of a trade: the 1.20% the curve accumulates after Meteora's protocol share, less the coin creator's 25% of it. user.fun's own configuration records an effective rate of 0.96%, which is this 0.90% plus the 0.06% referral leg Meteora returns to whichever interface hosted the swap. That leg is counted in Fees and not here, because the swap event does not name the referral account and so cannot show which trades it was ours to claim.",
    ProtocolRevenue: 'Same as Revenue (0.9% of the trade). user.fun has no separate holder or treasury leg on chain.',
    SupplySideRevenue:
      "Everything user.fun does not keep, which is 0.60% of a trade: the coin creator's 25% of the 1.20% curve fee, plus Meteora's 0.30% protocol share and the referral leg inside it paid to whichever interface hosted the swap.",
  },
  breakdownMethodology: {
    Fees: {
      [metrics.PlatformFees]: 'The user.fun partner share of the bonding curve trading fee.',
      [metrics.CreatorFees]: "The coin creator's share of the bonding curve trading fee.",
      [metrics.ProtocolFees]:
        "Meteora's protocol share, taken off the top before the curve accumulates anything.",
      [metrics.ReferralFees]:
        "The part of Meteora's protocol share handed back to whichever interface hosted the swap. Not attributed to user.fun, because the swap event does not name the referral account.",
    },
    Revenue: {
      [metrics.PlatformFees]: 'The user.fun partner share of the bonding curve trading fee.',
    },
    ProtocolRevenue: {
      [metrics.PlatformFees]: 'The user.fun partner share of the bonding curve trading fee.',
    },
    SupplySideRevenue: {
      [metrics.CreatorFees]: "The coin creator's share of the bonding curve trading fee.",
      [metrics.ProtocolFees]:
        "Meteora's protocol share, taken off the top before the curve accumulates anything.",
      [metrics.ReferralFees]:
        "The part of Meteora's protocol share handed back to whichever interface hosted the swap.",
    },
  },
};

export default adapter;
