import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { assertComplete, programEventsSql, u64 } from "../../helpers/alliumSolanaEvents";
import { CHAIN } from "../../helpers/chains";
import { base58Encode, getProgramAccounts } from "../../helpers/solana";

const LAUNCHED = "event Launched(address indexed market, address indexed token, address indexed creator, address quote, bool nativeAlpha)";
const FEE_PRESET_SELECTED = "event FeePresetSelected(address indexed market, uint8 preset, bytes32 policyDigest, address indexed feeRecipient)";
const TRADE = "event Trade(address indexed trader, bool buy, uint256 baseAmount, uint256 quoteAmount, uint256 fee)";
const SWAP_FEE_COLLECTED = "event SwapFeeCollected(bytes32 indexed poolId, address indexed quote, uint256 protocolFee, uint256 creatorFee)";
const BUYBACK_RELEASED = "event BuybackReleased(address indexed asset, address indexed executor, uint256 amount)";

// Every trade pays a 1% protocol fee plus the creator fee fixed by the market preset.
const PROTOCOL_FEE_BPS = 100n;
// FeePresetSelected.preset: 0 = Lean, 1 = Standard, 2 = CreatorPlus
const CREATOR_FEE_BPS = [0n, 25n, 50n];

const CURVE_FEES = "Bonding Curve Trading Fees";
const POOL_FEES = "Graduated Pool Trading Fees";
const CURVE_FEES_TO_PROTOCOL = "Bonding Curve Trading Fees To Protocol";
const POOL_FEES_TO_PROTOCOL = "Graduated Pool Trading Fees To Protocol";
const CURVE_FEES_TO_CREATORS = "Bonding Curve Trading Fees To Creators";
const POOL_FEES_TO_CREATORS = "Graduated Pool Trading Fees To Creators";
const FEES_TO_OPERATIONS = "Protocol Fees To Operations";
const FEES_TO_BUYBACK = "Protocol Fees Released To ALPHA Buyback And Burn";

// factory: LaunchFactory (block = its deployment block), hook: LaunchTradingHookV1, splitter: ProtocolRevenueSplitter
const chainConfig: Record<string, { factory: string; block: number; hook: string; splitter: string; start: string }> = {
  [CHAIN.ROBINHOOD]: {
    factory: "0xD45D538AA6Ab9261A638b9Df83312f823BB368fC",
    block: 103445727,
    hook: "0x869642f4237fC027D141055eC683F37bacA0A0cC",
    splitter: "0x99BEC52EEbeB864E02E5BFc886423d041b820B87",
    start: "2026-11-02",
  },
  [CHAIN.BASE]: {
    factory: "0x7cdd6aCD10144C89B630Bce8b2031d80df57628c",
    block: 53375932,
    hook: "0x5a4D4781266439D20425c668fcadd8EECF3620cc",
    splitter: "0xde8eb4358d2b560608928DaDa47ca10faAf87850",
    start: "2026-11-02",
  },
  [CHAIN.BSC]: {
    factory: "0x71abe80C8f08ebE5dac018601170e687ED737AC3",
    block: 131062839,
    hook: "0x90736d933c9EACD863fE557C2B8AFB769263A0CC",
    splitter: "0xCbCD64e5bc8c796A4778631cB9a81375A6754B38",
    start: "2026-11-02",
  },
  [CHAIN.ARC]: {
    factory: "0x11A5ac5fC2A1e7D4bF61B781b0b784462C2BD9e7",
    block: 28998006,
    hook: "0x05456d08625f554332769699ff0608f1E59A60cC",
    splitter: "0x1b304c1Ce20eE9531172342416538027BFd636b8",
    start: "2026-11-02",
  },
  // Ethereum (factory 0x2DC4f507BD30c6b5df90B288FaeCDeCE627386Ec) has no market yet, add it once it has trades.
};

// ALPHA launch program on Solana: https://solscan.io/account/r4yX8Q9Z5zSLY2fjoq1DgijfoHLru49zfikq79pa1fa
const SOLANA_PROGRAM = "r4yX8Q9Z5zSLY2fjoq1DgijfoHLru49zfikq79pa1fa";
// base58 of the Anchor `Market` account discriminator, and where quote_mint sits in that account
const MARKET_DISCRIMINATOR = "dkokXHR3DTw";
const MARKET_QUOTE_MINT_OFFSET = 141;
// sha256("event:<Name>")[0..8] and event size in bytes, discriminator included. Events are written with emit!, as program logs.
// TradeExecuted: market @8, trader, recipient, is_buy, base_amount, quote_principal, quote_settlement, protocol_fee u64 @129, creator_fee u64 @137, stage
const TRADE_EXECUTED = { discriminator: "296E40813C4FB350", size: 146 };
// PoolFeesSettled: market @8, sequence, pool, quote_mint, collected_quote_amount, operations_amount u64 @120, buyback_amount u64 @128, creator_amount u64 @136
const POOL_FEES_SETTLED = { discriminator: "17C8582B8F538E2B", size: 144 };
// launch_market and execute_meteora_migration, sha256("global:<name>")[0..8]. They call Meteora and Metaplex, which can cut the
// logs at the 10 kB limit (e.g. 5UUwMdczu1dLAJQWauHGYgeudz7QPau5BTh28WCGXd4ue8o5KPLEJFU16tdvwF3f52scjwR5exswdXNUnWSzuj1J).
// Neither emits an event read here, so truncated logs lose nothing when a transaction only calls these.
const SOLANA_QUIET_INSTRUCTIONS = { [SOLANA_PROGRAM]: ["9b4734dd391eff85", "010afc44da4f6f56"] };

const createFeeBalances = (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const addFee = (quote: string, protocolFee: bigint, creatorFee: bigint, labels: string[]) => {
    const [fees, toProtocol, toCreators] = labels;
    dailyFees.add(quote, protocolFee + creatorFee, fees);
    dailyRevenue.add(quote, protocolFee, toProtocol);
    dailySupplySideRevenue.add(quote, creatorFee, toCreators);
    // Half of the protocol fee is booked for operations and half for the ALPHA buyback.
    dailyProtocolRevenue.add(quote, protocolFee / 2n, FEES_TO_OPERATIONS);
  };

  const result = () => ({
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  });

  return { addFee, dailyHoldersRevenue, result };
};

const fetch = async (options: FetchOptions) => {
  const { factory, block, hook, splitter } = chainConfig[options.chain];
  const { addFee, dailyHoldersRevenue, result } = createFeeBalances(options);

  const launches = await options.getLogs({ target: factory, eventAbi: LAUNCHED, fromBlock: block, cacheInCloud: true });
  const presetLogs = await options.getLogs({ target: factory, eventAbi: FEE_PRESET_SELECTED, fromBlock: block, cacheInCloud: true });
  const presets: Record<string, number> = {};
  for (const log of presetLogs) presets[log.market.toLowerCase()] = Number(log.preset);

  if (launches.length) {
    const markets = launches.map((launch: any) => launch.market);
    const tradeLogs = await options.getLogs({ targets: markets, eventAbi: TRADE, flatten: false });

    tradeLogs.forEach((trades: any[], i: number) => {
      const market = markets[i].toLowerCase();
      const creatorBps = CREATOR_FEE_BPS[presets[market]];
      if (creatorBps === undefined) throw new Error(`alpha-launchpad: unknown fee preset ${presets[market]} for market ${market} on ${options.chain}`);
      for (const trade of trades) {
        // Trade.fee is the total fee in the market's quote asset.
        const fee = BigInt(trade.fee);
        const protocolFee = (fee * PROTOCOL_FEE_BPS) / (PROTOCOL_FEE_BPS + creatorBps);
        addFee(launches[i].quote, protocolFee, fee - protocolFee, [CURVE_FEES, CURVE_FEES_TO_PROTOCOL, CURVE_FEES_TO_CREATORS]);
      }
    });
  }

  const poolFeeLogs = await options.getLogs({ target: hook, eventAbi: SWAP_FEE_COLLECTED });
  for (const log of poolFeeLogs) {
    addFee(log.quote, BigInt(log.protocolFee), BigInt(log.creatorFee), [POOL_FEES, POOL_FEES_TO_PROTOCOL, POOL_FEES_TO_CREATORS]);
  }

  // The buyback half counts when the chain shows it leaving the splitter for the burn executor, not when it accrues.
  const buybackLogs = await options.getLogs({ target: splitter, eventAbi: BUYBACK_RELEASED });
  for (const log of buybackLogs) {
    dailyHoldersRevenue.add(log.asset, log.amount, FEES_TO_BUYBACK);
  }

  return result();
};

const fetchSolana = async (options: FetchOptions) => {
  const { addFee, result } = createFeeBalances(options);

  const ofEvent = (event: { discriminator: string }) => `FROM program_events WHERE STARTSWITH(data, '${event.discriminator}')`;
  const knownSize = (event: { discriminator: string; size: number }) => `SELECT COUNT(*) ${ofEvent(event)} AND LENGTH(data) <> ${2 * event.size}`;

  const rows = await queryAllium(`${programEventsSql(SOLANA_PROGRAM, options, SOLANA_QUIET_INSTRUCTIONS)},
  fee_events AS (
    SELECT 'curve' AS kind, SUBSTR(data, 17, 64) AS market_hex, ${u64("data", 129)} AS protocol_fee, ${u64("data", 137)} AS creator_fee
    ${ofEvent(TRADE_EXECUTED)}
    UNION ALL
    SELECT 'pool', SUBSTR(data, 17, 64), ${u64("data", 120)} + ${u64("data", 128)}, ${u64("data", 136)}
    ${ofEvent(POOL_FEES_SETTLED)}
  ),
  fees AS (
    SELECT kind, market_hex, SUM(protocol_fee)::VARCHAR AS protocol_fee, SUM(creator_fee)::VARCHAR AS creator_fee
    FROM fee_events
    GROUP BY 1, 2
  )
  SELECT checks.*,
    -- an event with a size it never had: its layout changed and the offsets above may no longer hold
    (${knownSize(TRADE_EXECUTED)}) + (${knownSize(POOL_FEES_SETTLED)}) AS unknown_layouts,
    fees.kind, fees.market_hex, fees.protocol_fee, fees.creator_fee
  FROM checks
  LEFT JOIN fees ON TRUE`);

  assertComplete(rows[0], "alpha-launchpad", options);
  if (Number(rows[0].unknown_layouts) > 0)
    throw new Error(`alpha-launchpad: ${rows[0].unknown_layouts} fee events with an unexpected size, their layout changed`);

  const feeRows = rows.filter((row: any) => row.market_hex);
  if (!feeRows.length) return result();

  // TradeExecuted names the market, not the quote asset, so map market to quote mint
  const markets = await getProgramAccounts({
    programId: SOLANA_PROGRAM,
    encoding: "base64",
    filters: [{ memcmp: { offset: 0, bytes: MARKET_DISCRIMINATOR } }],
    dataSlice: { offset: MARKET_QUOTE_MINT_OFFSET, length: 32 },
  });
  const quoteMints: Record<string, string> = {};
  markets.forEach((market: any) => {
    quoteMints[market.pubkey] = base58Encode(Buffer.from(market.account.data[0], "base64"));
  });

  for (const row of feeRows) {
    const market = base58Encode(Buffer.from(row.market_hex, "hex"));
    const quote = quoteMints[market];
    if (!quote) throw new Error(`alpha-launchpad: fee event for unknown market ${market}`);
    const labels = row.kind === "curve"
      ? [CURVE_FEES, CURVE_FEES_TO_PROTOCOL, CURVE_FEES_TO_CREATORS]
      : [POOL_FEES, POOL_FEES_TO_PROTOCOL, POOL_FEES_TO_CREATORS];
    addFee(quote, BigInt(row.protocol_fee), BigInt(row.creator_fee), labels);
  }

  return result();
};

const methodology = {
  Fees: "Trading fees paid by traders on bonding curves and on graduated pools: a 1% protocol fee plus a creator fee of 0, 0.25 or 0.5%. On Solana, graduated pool fees are the ALPHA share of the Meteora DAMM v2 pool fee, counted when claimed, and the fee on a creator's first buy inside the launch transaction is not counted because no event reports it.",
  UserFees: "Trading fees paid by traders on bonding curves and on graduated pools.",
  Revenue: "The 1% protocol fee taken on every trade.",
  SupplySideRevenue: "The creator fee of 0, 0.25 or 0.5% paid to the token creator on every trade.",
  ProtocolRevenue: "Half of the 1% protocol fee, booked for operations.",
  HoldersRevenue: "The other half of the protocol fee, counted when it is released on chain to the executor that buys back and burns ALPHA. Amounts booked for the buyback but not yet released are not counted. Not tracked on Solana.",
};

const breakdownMethodology = {
  Fees: {
    [CURVE_FEES]: "Protocol and creator fees paid on bonding curve trades.",
    [POOL_FEES]: "Protocol and creator fees charged by the ALPHA hook on graduated Uniswap v4 pools, and the ALPHA share of Meteora DAMM v2 pool fees on Solana.",
  },
  UserFees: {
    [CURVE_FEES]: "Protocol and creator fees paid on bonding curve trades.",
    [POOL_FEES]: "Protocol and creator fees charged by the ALPHA hook on graduated Uniswap v4 pools, and the ALPHA share of Meteora DAMM v2 pool fees on Solana.",
  },
  Revenue: {
    [CURVE_FEES_TO_PROTOCOL]: "The 1% protocol fee on bonding curve trades.",
    [POOL_FEES_TO_PROTOCOL]: "The 1% protocol fee on graduated pool trades.",
  },
  SupplySideRevenue: {
    [CURVE_FEES_TO_CREATORS]: "The creator fee on bonding curve trades.",
    [POOL_FEES_TO_CREATORS]: "The creator fee on graduated pool trades.",
  },
  ProtocolRevenue: {
    [FEES_TO_OPERATIONS]: "Half of the 1% protocol fee, booked for operations.",
  },
  HoldersRevenue: {
    [FEES_TO_BUYBACK]: "Protocol fees released on chain to the executor that buys back and burns ALPHA.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    ...chainConfig,
    // first trade on the Solana program
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-10-22" },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
