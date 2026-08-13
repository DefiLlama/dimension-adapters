import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const LAUNCH_FEE = 1_000_000_000_000_000n; // 0.001 ETH
const TREASURY = "0xDB38F82cc039B97996362D2a63E9C2a55A31833b";

const EVM_CONFIG: Record<string, {
  start: string;
  factory: string;
  lpLocker: string;
  feeLocker: string;
}> = {
  [CHAIN.BASE]: {
    start: "2026-06-16",
    factory: "0xAD6f6a5e5D37870D7325CA663644020fE67a042F",
    lpLocker: "0xa70FACF8ddD62Fc14d62EF1500cc359eB1eAfb68",
    feeLocker: "0x21e0e33370bDe6F6ed0cf46bBE74BA19fEDE4961",
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-03",
    factory: "0x960d2d412ed19DaD39037D2334891AeBd660a32e",
    lpLocker: "0xbcf8Da3827345BC3325bAAE2DC91b6b7AD324Bf9",
    feeLocker: "0x4d9E8a416576Fd56C723eff6C9200e3330c5d3d4",
  },
};

const TOKEN_CREATED =
  "event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)";
const STORE_TOKENS =
  "event StoreTokens(address indexed depositor, address indexed feeOwner, address indexed token, uint256 balance, uint256 amount)";

const LAUNCH_FEE_LABEL = "Token Launch Fees";
const SWAP_FEE_LABEL = "Swap Fees";
const SWAP_FEE_TO_ZNS = "Swap Fees To ZNS Treasury";
const SWAP_FEE_TO_CREATORS = "Swap Fees To Creators And Referrers";

async function fetchEvm(options: FetchOptions) {
  const config = EVM_CONFIG[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const launches = await options.getLogs({
    target: config.factory,
    eventAbi: TOKEN_CREATED,
  });
  const launchFees = LAUNCH_FEE * BigInt(launches.length);
  dailyFees.addGasToken(launchFees, LAUNCH_FEE_LABEL);
  dailyRevenue.addGasToken(launchFees, LAUNCH_FEE_LABEL);

  // The LP locker harvests the pool's accrued Uniswap v4 fees and stores each
  // recipient's exact share in the fee locker. Counting StoreTokens.amount
  // preserves the dynamic anti-snipe rate and the no-referrer treasury fallback.
  const storedFees = await options.getLogs({
    target: config.feeLocker,
    eventAbi: STORE_TOKENS,
  });
  for (const log of storedFees) {
    if (log.depositor.toLowerCase() !== config.lpLocker.toLowerCase()) continue;
    const amount = BigInt(log.amount);
    if (amount === 0n) continue;

    dailyFees.add(log.token, amount, SWAP_FEE_LABEL);
    if (log.feeOwner.toLowerCase() === TREASURY.toLowerCase()) {
      dailyRevenue.add(log.token, amount, SWAP_FEE_TO_ZNS);
    } else {
      dailySupplySideRevenue.add(log.token, amount, SWAP_FEE_TO_CREATORS);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const SOLANA_CONFIGS = [
  "Ag218y7qLGf3gmLRzPZMaLu3ghnGUZstpjeiUi6GGPz9",
  "DEKVtkTtGf14fiVY2pa1WykHJpm4XzTA745SfGrSH7mv",
  "9qYwiLdfvKtCEQA5M1YgTYSXjZdLQ5XobE7vW3E1tePb",
];
const WSOL = ADDRESSES.solana.SOL;

interface SolanaRow {
  trading_fees: string;
  creator_fees: string;
  meteora_fees: string;
  routing_referral_fees: string;
}

async function fetchSolana(options: FetchOptions) {
  const configs = SOLANA_CONFIGS.map((config) => `'${config}'`).join(", ");
  const rows = await queryDuneSql(options, `
    WITH zns_configs AS (
      SELECT DISTINCT
        account_config AS config,
        account_quote_mint AS quote_mint,
        CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.collect_fee_mode') AS INT) AS collect_fee_mode,
        CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_trading_fee_percentage') AS INT) AS creator_trading_pct
      FROM meteora_solana.dynamic_bonding_curve_call_create_config
      WHERE account_config IN (${configs})
        AND account_quote_mint = '${WSOL}'
    ),
    swaps AS (
      SELECT
        s.trade_direction,
        c.collect_fee_mode,
        c.creator_trading_pct,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
      FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
      JOIN zns_configs c ON s.config = c.config
      WHERE s.evt_executing_account = '${DBC_PROGRAM}'
        AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
        AND s.evt_block_time < from_unixtime(${options.endTimestamp})
    )
    -- Meteora DBC enum values: collect_fee_mode=0 collects fees only in the
    -- quote mint, while collect_fee_mode=1 collects in each swap's output
    -- token. trade_direction=1 is quote-to-base, so that combination produces
    -- fees in the newly launched base token. Those base-token fees are not
    -- priced by this adapter and are excluded; all other rows are wSOL because
    -- every allowlisted ZNS config is explicitly filtered to the wSOL quote.
    -- creator_trading_fee_percentage is an integer percentage on a 0..100 scale.
    SELECT
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE trading_fee END), 0) AS VARCHAR) AS trading_fees,
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE trading_fee * creator_trading_pct / 100 END), 0) AS VARCHAR) AS creator_fees,
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE protocol_fee END), 0) AS VARCHAR) AS meteora_fees,
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE referral_fee END), 0) AS VARCHAR) AS routing_referral_fees
    FROM swaps
  `) as SolanaRow[];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const row = rows[0];
  if (row) {
    const tradingFees = BigInt(row.trading_fees || 0);
    const creatorFees = BigInt(row.creator_fees || 0);
    const meteoraFees = BigInt(row.meteora_fees || 0);
    const routingReferralFees = BigInt(row.routing_referral_fees || 0);
    const partnerFees = tradingFees - creatorFees;

    dailyFees.add(WSOL, tradingFees, SWAP_FEE_LABEL);
    dailyFees.add(WSOL, meteoraFees, "Meteora Protocol Fees");
    dailyFees.add(WSOL, routingReferralFees, "Meteora Routing Referral Fees");

    // ZNS' partner share is split by its on-chain splitter: 60% to the
    // authorized referrer and 40% to treasury. If the launch has no authorized
    // referrer, its referrer slot resolves to the treasury; this adapter uses
    // the conservative fixed treasury share until splitter distribution events
    // are available in Dune.
    const znsTreasuryFees = partnerFees * 40n / 100n;
    const znsReferrerFees = partnerFees - znsTreasuryFees;
    dailyRevenue.add(WSOL, znsTreasuryFees, SWAP_FEE_TO_ZNS);
    dailySupplySideRevenue.add(WSOL, creatorFees, "Swap Fees To Creators");
    dailySupplySideRevenue.add(WSOL, znsReferrerFees, "Swap Fees To ZNS Referrers");
    dailySupplySideRevenue.add(WSOL, meteoraFees, "Swap Fees To Meteora");
    dailySupplySideRevenue.add(WSOL, routingReferralFees, "Swap Fees To Routing Referrers");
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees:
    "EVM token launch fees plus Uniswap v4 LP swap fees harvested from ZNS-launched pools; on Solana, wSOL-denominated Meteora DBC trading, protocol, and routing-referral fees paid by traders in the three wSOL production configs. DBC fees collected in a newly launched base token are excluded because that token cannot be reliably priced.",
  Revenue:
    "Fees retained by ZNS: EVM launch fees and the exact treasury shares booked by the EVM fee locker; on Solana, the fixed 40% treasury share of ZNS partner trading fees. Solana no-referrer fallback is conservatively excluded until splitter distribution events are indexed by Dune.",
  ProtocolRevenue: "Same as Revenue: fees allocated to the ZNS treasury.",
  SupplySideRevenue:
    "Fees allocated to token creators, launch referrers, Meteora, and swap-routing referrers.",
};

const breakdownMethodology = {
  Fees: {
    [LAUNCH_FEE_LABEL]: "Flat 0.001 ETH fee paid on each Base and Robinhood Chain token launch.",
    [SWAP_FEE_LABEL]: "Swap fees paid by traders in ZNS-launched Uniswap v4 and Meteora DBC pools.",
    "Meteora Protocol Fees": "Meteora's protocol share of Solana DBC swap fees.",
    "Meteora Routing Referral Fees": "Referral fees paid by Meteora to the frontend or router submitting a Solana DBC swap.",
  },
  Revenue: {
    [LAUNCH_FEE_LABEL]: "EVM token launch fees sent to the ZNS treasury.",
    [SWAP_FEE_TO_ZNS]: "Swap fees allocated to the ZNS treasury.",
  },
  ProtocolRevenue: {
    [LAUNCH_FEE_LABEL]: "EVM token launch fees sent to the ZNS treasury.",
    [SWAP_FEE_TO_ZNS]: "Swap fees allocated to the ZNS treasury.",
  },
  SupplySideRevenue: {
    [SWAP_FEE_TO_CREATORS]: "EVM swap-fee shares allocated to creators and launch referrers.",
    "Swap Fees To Creators": "Solana DBC trading-fee share allocated to token creators by the Meteora config.",
    "Swap Fees To ZNS Referrers": "Solana ZNS partner-fee share allocated to authorized launch referrers.",
    "Swap Fees To Meteora": "Meteora protocol share of Solana DBC swap fees.",
    "Swap Fees To Routing Referrers": "Meteora referral fee paid to swap-routing frontends.",
  },
};

const adapter: Adapter = {
  version: 2,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // Uniswap v4 and Meteora may also report the same underlying swap fees.
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: { fetch: fetchEvm, start: EVM_CONFIG[CHAIN.BASE].start },
    [CHAIN.ROBINHOOD]: { fetch: fetchEvm, start: EVM_CONFIG[CHAIN.ROBINHOOD].start },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-08-11" },
  },
};

export default adapter;
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const LAUNCH_FEE = 1_000_000_000_000_000n; // 0.001 ETH
const TREASURY = "0xDB38F82cc039B97996362D2a63E9C2a55A31833b";

const EVM_CONFIG: Record<string, {
  start: string;
  factory: string;
  lpLocker: string;
  feeLocker: string;
}> = {
  [CHAIN.BASE]: {
    start: "2026-06-16",
    factory: "0xAD6f6a5e5D37870D7325CA663644020fE67a042F",
    lpLocker: "0xa70FACF8ddD62Fc14d62EF1500cc359eB1eAfb68",
    feeLocker: "0x21e0e33370bDe6F6ed0cf46bBE74BA19fEDE4961",
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-03",
    factory: "0x960d2d412ed19DaD39037D2334891AeBd660a32e",
    lpLocker: "0xbcf8Da3827345BC3325bAAE2DC91b6b7AD324Bf9",
    feeLocker: "0x4d9E8a416576Fd56C723eff6C9200e3330c5d3d4",
  },
};

const TOKEN_CREATED =
  "event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)";
const STORE_TOKENS =
  "event StoreTokens(address indexed depositor, address indexed feeOwner, address indexed token, uint256 balance, uint256 amount)";

const LAUNCH_FEE_LABEL = "Token Launch Fees";
const SWAP_FEE_LABEL = "Swap Fees";
const SWAP_FEE_TO_ZNS = "Swap Fees To ZNS Treasury";
const SWAP_FEE_TO_CREATORS = "Swap Fees To Creators And Referrers";

async function fetchEvm(options: FetchOptions) {
  const config = EVM_CONFIG[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const launches = await options.getLogs({
    target: config.factory,
    eventAbi: TOKEN_CREATED,
  });
  const launchFees = LAUNCH_FEE * BigInt(launches.length);
  dailyFees.addGasToken(launchFees, LAUNCH_FEE_LABEL);
  dailyRevenue.addGasToken(launchFees, LAUNCH_FEE_LABEL);

  // The LP locker harvests the pool's accrued Uniswap v4 fees and stores each
  // recipient's exact share in the fee locker. Counting StoreTokens.amount
  // preserves the dynamic anti-snipe rate and the no-referrer treasury fallback.
  const storedFees = await options.getLogs({
    target: config.feeLocker,
    eventAbi: STORE_TOKENS,
  });
  for (const log of storedFees) {
    if (log.depositor.toLowerCase() !== config.lpLocker.toLowerCase()) continue;
    const amount = BigInt(log.amount);
    if (amount === 0n) continue;

    dailyFees.add(log.token, amount, SWAP_FEE_LABEL);
    if (log.feeOwner.toLowerCase() === TREASURY.toLowerCase()) {
      dailyRevenue.add(log.token, amount, SWAP_FEE_TO_ZNS);
    } else {
      dailySupplySideRevenue.add(log.token, amount, SWAP_FEE_TO_CREATORS);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const SOLANA_CONFIGS = [
  "Ag218y7qLGf3gmLRzPZMaLu3ghnGUZstpjeiUi6GGPz9",
  "DEKVtkTtGf14fiVY2pa1WykHJpm4XzTA745SfGrSH7mv",
  "9qYwiLdfvKtCEQA5M1YgTYSXjZdLQ5XobE7vW3E1tePb",
];
const WSOL = ADDRESSES.solana.SOL;

interface SolanaRow {
  trading_fees: string;
  creator_fees: string;
  meteora_fees: string;
  routing_referral_fees: string;
}

async function fetchSolana(options: FetchOptions) {
  const configs = SOLANA_CONFIGS.map((config) => `'${config}'`).join(", ");
  const rows = await queryDuneSql(options, `
    WITH zns_configs AS (
      SELECT DISTINCT
        account_config AS config,
        account_quote_mint AS quote_mint,
        CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.collect_fee_mode') AS INT) AS collect_fee_mode,
        CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_trading_fee_percentage') AS INT) AS creator_trading_pct
      FROM meteora_solana.dynamic_bonding_curve_call_create_config
      WHERE account_config IN (${configs})
        AND account_quote_mint = '${WSOL}'
    ),
    swaps AS (
      SELECT
        s.trade_direction,
        c.collect_fee_mode,
        c.creator_trading_pct,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
      FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
      JOIN zns_configs c ON s.config = c.config
      WHERE s.evt_executing_account = '${DBC_PROGRAM}'
        AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
        AND s.evt_block_time < from_unixtime(${options.endTimestamp})
    )
    -- Meteora DBC enum values: collect_fee_mode=0 collects fees only in the
    -- quote mint, while collect_fee_mode=1 collects in each swap's output
    -- token. trade_direction=1 is quote-to-base, so that combination produces
    -- fees in the newly launched base token. Those base-token fees are not
    -- priced by this adapter and are excluded; all other rows are wSOL because
    -- every allowlisted ZNS config is explicitly filtered to the wSOL quote.
    -- creator_trading_fee_percentage is an integer percentage on a 0..100 scale.
    SELECT
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE trading_fee END), 0) AS VARCHAR) AS trading_fees,
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE trading_fee * creator_trading_pct / 100 END), 0) AS VARCHAR) AS creator_fees,
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE protocol_fee END), 0) AS VARCHAR) AS meteora_fees,
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE referral_fee END), 0) AS VARCHAR) AS routing_referral_fees
    FROM swaps
  `) as SolanaRow[];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const row = rows[0];
  if (row) {
    const tradingFees = BigInt(row.trading_fees || 0);
    const creatorFees = BigInt(row.creator_fees || 0);
    const meteoraFees = BigInt(row.meteora_fees || 0);
    const routingReferralFees = BigInt(row.routing_referral_fees || 0);
    const partnerFees = tradingFees - creatorFees;

    dailyFees.add(WSOL, tradingFees, SWAP_FEE_LABEL);
    dailyFees.add(WSOL, meteoraFees, "Meteora Protocol Fees");
    dailyFees.add(WSOL, routingReferralFees, "Meteora Routing Referral Fees");

    // ZNS' partner share is split by its on-chain splitter: 60% to the
    // authorized referrer and 40% to treasury. If the launch has no authorized
    // referrer, its referrer slot resolves to the treasury; this adapter uses
    // the conservative fixed treasury share until splitter distribution events
    // are available in Dune.
    const znsTreasuryFees = partnerFees * 40n / 100n;
    const znsReferrerFees = partnerFees - znsTreasuryFees;
    dailyRevenue.add(WSOL, znsTreasuryFees, SWAP_FEE_TO_ZNS);
    dailySupplySideRevenue.add(WSOL, creatorFees, "Swap Fees To Creators");
    dailySupplySideRevenue.add(WSOL, znsReferrerFees, "Swap Fees To ZNS Referrers");
    dailySupplySideRevenue.add(WSOL, meteoraFees, "Swap Fees To Meteora");
    dailySupplySideRevenue.add(WSOL, routingReferralFees, "Swap Fees To Routing Referrers");
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees:
    "EVM token launch fees plus Uniswap v4 LP swap fees harvested from ZNS-launched pools; on Solana, wSOL-denominated Meteora DBC trading, protocol, and routing-referral fees paid by traders in the three wSOL production configs. DBC fees collected in a newly launched base token are excluded because that token cannot be reliably priced.",
  Revenue:
    "Fees retained by ZNS: EVM launch fees and the exact treasury shares booked by the EVM fee locker; on Solana, the fixed 40% treasury share of ZNS partner trading fees. Solana no-referrer fallback is conservatively excluded until splitter distribution events are indexed by Dune.",
  ProtocolRevenue: "Same as Revenue: fees allocated to the ZNS treasury.",
  SupplySideRevenue:
    "Fees allocated to token creators, launch referrers, Meteora, and swap-routing referrers.",
};

const breakdownMethodology = {
  Fees: {
    [LAUNCH_FEE_LABEL]: "Flat 0.001 ETH fee paid on each Base and Robinhood Chain token launch.",
    [SWAP_FEE_LABEL]: "Swap fees paid by traders in ZNS-launched Uniswap v4 and Meteora DBC pools.",
    "Meteora Protocol Fees": "Meteora's protocol share of Solana DBC swap fees.",
    "Meteora Routing Referral Fees": "Referral fees paid by Meteora to the frontend or router submitting a Solana DBC swap.",
  },
  Revenue: {
    [LAUNCH_FEE_LABEL]: "EVM token launch fees sent to the ZNS treasury.",
    [SWAP_FEE_TO_ZNS]: "Swap fees allocated to the ZNS treasury.",
  },
  ProtocolRevenue: {
    [LAUNCH_FEE_LABEL]: "EVM token launch fees sent to the ZNS treasury.",
    [SWAP_FEE_TO_ZNS]: "Swap fees allocated to the ZNS treasury.",
  },
  SupplySideRevenue: {
    [SWAP_FEE_TO_CREATORS]: "EVM swap-fee shares allocated to creators and launch referrers.",
    "Swap Fees To Creators": "Solana DBC trading-fee share allocated to token creators by the Meteora config.",
    "Swap Fees To ZNS Referrers": "Solana ZNS partner-fee share allocated to authorized launch referrers.",
    "Swap Fees To Meteora": "Meteora protocol share of Solana DBC swap fees.",
    "Swap Fees To Routing Referrers": "Meteora referral fee paid to swap-routing frontends.",
  },
};

const adapter: Adapter = {
  version: 2,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // Uniswap v4 and Meteora may also report the same underlying swap fees.
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: { fetch: fetchEvm, start: EVM_CONFIG[CHAIN.BASE].start },
    [CHAIN.ROBINHOOD]: { fetch: fetchEvm, start: EVM_CONFIG[CHAIN.ROBINHOOD].start },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-08-11" },
  },
};

export default adapter;
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const LAUNCH_FEE = 1_000_000_000_000_000n; // 0.001 ETH
const TREASURY = "0xDB38F82cc039B97996362D2a63E9C2a55A31833b";

const EVM_CONFIG: Record<string, {
  start: string;
  factory: string;
  lpLocker: string;
  feeLocker: string;
}> = {
  [CHAIN.BASE]: {
    start: "2026-06-16",
    factory: "0xAD6f6a5e5D37870D7325CA663644020fE67a042F",
    lpLocker: "0xa70FACF8ddD62Fc14d62EF1500cc359eB1eAfb68",
    feeLocker: "0x21e0e33370bDe6F6ed0cf46bBE74BA19fEDE4961",
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-03",
    factory: "0x960d2d412ed19DaD39037D2334891AeBd660a32e",
    lpLocker: "0xbcf8Da3827345BC3325bAAE2DC91b6b7AD324Bf9",
    feeLocker: "0x4d9E8a416576Fd56C723eff6C9200e3330c5d3d4",
  },
};

const TOKEN_CREATED_TOPIC =
  "0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67";
const STORE_TOKENS =
  "event StoreTokens(address indexed depositor, address indexed feeOwner, address indexed token, uint256 balance, uint256 amount)";

const LAUNCH_FEE_LABEL = "Token Launch Fees";
const SWAP_FEE_LABEL = "Swap Fees";
const SWAP_FEE_TO_ZNS = "Swap Fees To ZNS Treasury";
const SWAP_FEE_TO_CREATORS = "Swap Fees To Creators And Referrers";

async function fetchEvm(options: FetchOptions) {
  const config = EVM_CONFIG[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const launches = await options.getLogs({
    target: config.factory,
    topics: [TOKEN_CREATED_TOPIC],
    onlyArgs: false,
  });
  const launchFees = LAUNCH_FEE * BigInt(launches.length);
  dailyFees.addGasToken(launchFees, LAUNCH_FEE_LABEL);
  dailyRevenue.addGasToken(launchFees, LAUNCH_FEE_LABEL);

  // The LP locker harvests the pool's accrued Uniswap v4 fees and stores each
  // recipient's exact share in the fee locker. Counting StoreTokens.amount
  // preserves the dynamic anti-snipe rate and the no-referrer treasury fallback.
  const storedFees = await options.getLogs({
    target: config.feeLocker,
    eventAbi: STORE_TOKENS,
  });
  for (const log of storedFees) {
    if (log.depositor.toLowerCase() !== config.lpLocker.toLowerCase()) continue;
    const amount = BigInt(log.amount);
    if (amount === 0n) continue;

    dailyFees.add(log.token, amount, SWAP_FEE_LABEL);
    if (log.feeOwner.toLowerCase() === TREASURY.toLowerCase()) {
      dailyRevenue.add(log.token, amount, SWAP_FEE_TO_ZNS);
    } else {
      dailySupplySideRevenue.add(log.token, amount, SWAP_FEE_TO_CREATORS);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const SOLANA_CONFIGS = [
  "Ag218y7qLGf3gmLRzPZMaLu3ghnGUZstpjeiUi6GGPz9",
  "DEKVtkTtGf14fiVY2pa1WykHJpm4XzTA745SfGrSH7mv",
  "9qYwiLdfvKtCEQA5M1YgTYSXjZdLQ5XobE7vW3E1tePb",
];

interface SolanaRow {
  trading_fees: string;
  creator_fees: string;
  meteora_fees: string;
  routing_referral_fees: string;
}

async function fetchSolana(options: FetchOptions) {
  const configs = SOLANA_CONFIGS.map((config) => `'${config}'`).join(", ");
  const rows = await queryDuneSql(options, `
    WITH zns_configs AS (
      SELECT DISTINCT
        account_config AS config,
        CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.collect_fee_mode') AS INT) AS collect_fee_mode,
        CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_trading_fee_percentage') AS INT) AS creator_trading_pct
      FROM meteora_solana.dynamic_bonding_curve_call_create_config
      WHERE account_config IN (${configs})
    ),
    swaps AS (
      SELECT
        s.trade_direction,
        c.collect_fee_mode,
        c.creator_trading_pct,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
      FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
      JOIN zns_configs c ON s.config = c.config
      WHERE s.evt_executing_account = '${DBC_PROGRAM}'
        AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
        AND s.evt_block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE trading_fee END), 0) AS VARCHAR) AS trading_fees,
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE trading_fee * creator_trading_pct / 100 END), 0) AS VARCHAR) AS creator_fees,
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE protocol_fee END), 0) AS VARCHAR) AS meteora_fees,
      CAST(COALESCE(SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE referral_fee END), 0) AS VARCHAR) AS routing_referral_fees
    FROM swaps
  `) as SolanaRow[];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const row = rows[0];
  if (row) {
    const tradingFees = BigInt(row.trading_fees || 0);
    const creatorFees = BigInt(row.creator_fees || 0);
    const meteoraFees = BigInt(row.meteora_fees || 0);
    const routingReferralFees = BigInt(row.routing_referral_fees || 0);
    const partnerFees = tradingFees - creatorFees;

    dailyFees.add(ADDRESSES.solana.SOL, tradingFees, SWAP_FEE_LABEL);
    dailyFees.add(ADDRESSES.solana.SOL, meteoraFees, "Meteora Protocol Fees");
    dailyFees.add(ADDRESSES.solana.SOL, routingReferralFees, "Meteora Routing Referral Fees");

    // ZNS' partner share is split by its on-chain splitter: 60% to the
    // authorized referrer and 40% to treasury. If the launch has no authorized
    // referrer, its referrer slot resolves to the treasury; this adapter uses
    // the conservative fixed treasury share until splitter distribution events
    // are available in Dune.
    const znsTreasuryFees = partnerFees * 40n / 100n;
    const znsReferrerFees = partnerFees - znsTreasuryFees;
    dailyRevenue.add(ADDRESSES.solana.SOL, znsTreasuryFees, SWAP_FEE_TO_ZNS);
    dailySupplySideRevenue.add(ADDRESSES.solana.SOL, creatorFees, "Swap Fees To Creators");
    dailySupplySideRevenue.add(ADDRESSES.solana.SOL, znsReferrerFees, "Swap Fees To ZNS Referrers");
    dailySupplySideRevenue.add(ADDRESSES.solana.SOL, meteoraFees, "Swap Fees To Meteora");
    dailySupplySideRevenue.add(ADDRESSES.solana.SOL, routingReferralFees, "Swap Fees To Routing Referrers");
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees:
    "EVM token launch fees plus Uniswap v4 LP swap fees harvested from ZNS-launched pools; on Solana, all Meteora DBC trading, protocol, and routing-referral fees paid by traders in ZNS production configs.",
  Revenue:
    "Fees retained by ZNS: EVM launch fees and the exact treasury shares booked by the EVM fee locker; on Solana, the fixed 40% treasury share of ZNS partner trading fees. Solana no-referrer fallback is conservatively excluded until splitter distribution events are indexed by Dune.",
  ProtocolRevenue: "Same as Revenue: fees allocated to the ZNS treasury.",
  SupplySideRevenue:
    "Fees allocated to token creators, launch referrers, Meteora, and swap-routing referrers.",
};

const breakdownMethodology = {
  Fees: {
    [LAUNCH_FEE_LABEL]: "Flat 0.001 ETH fee paid on each Base and Robinhood Chain token launch.",
    [SWAP_FEE_LABEL]: "Swap fees paid by traders in ZNS-launched Uniswap v4 and Meteora DBC pools.",
    "Meteora Protocol Fees": "Meteora's protocol share of Solana DBC swap fees.",
    "Meteora Routing Referral Fees": "Referral fees paid by Meteora to the frontend or router submitting a Solana DBC swap.",
  },
  Revenue: {
    [LAUNCH_FEE_LABEL]: "EVM token launch fees sent to the ZNS treasury.",
    [SWAP_FEE_TO_ZNS]: "Swap fees allocated to the ZNS treasury.",
  },
  ProtocolRevenue: {
    [LAUNCH_FEE_LABEL]: "EVM token launch fees sent to the ZNS treasury.",
    [SWAP_FEE_TO_ZNS]: "Swap fees allocated to the ZNS treasury.",
  },
  SupplySideRevenue: {
    [SWAP_FEE_TO_CREATORS]: "EVM swap-fee shares allocated to creators and launch referrers.",
    "Swap Fees To Creators": "Solana DBC trading-fee share allocated to token creators by the Meteora config.",
    "Swap Fees To ZNS Referrers": "Solana ZNS partner-fee share allocated to authorized launch referrers.",
    "Swap Fees To Meteora": "Meteora protocol share of Solana DBC swap fees.",
    "Swap Fees To Routing Referrers": "Meteora referral fee paid to swap-routing frontends.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // Uniswap v4 and Meteora may also report the same underlying swap fees.
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: { fetch: fetchEvm, start: EVM_CONFIG[CHAIN.BASE].start },
    [CHAIN.ROBINHOOD]: { fetch: fetchEvm, start: EVM_CONFIG[CHAIN.ROBINHOOD].start },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-08-11" },
  },
};

export default adapter;
