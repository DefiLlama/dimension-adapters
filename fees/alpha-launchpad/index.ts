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

// Ethereum, Base, BSC, Robinhood and Arc have two ALPHA deployments: the first one (retired between 2026-10-28 and 2026-11-01,
// its markets still trade) and the current one. Monad, Avalanche, Arbitrum and Polygon have only the current one.
// factory: LaunchFactory, block: a block at or before the factory's first launch, hook: LaunchTradingHookV1,
// splitter: ProtocolRevenueSplitter. Addresses: ALPHA mainnet release records (indexer manifests).
type Deployment = { factory: string; block: number; hook: string; splitter: string };
const chainConfig: Record<string, { deployments: Deployment[]; start: string }> = {
  [CHAIN.ROBINHOOD]: {
    deployments: [
      // retired: first launch (SEEN, 0x4879a202A95D7b61ab661f5c319A4E1765F33C45) at block 100409410
      { factory: "0xDD09b37A5293E8cc3e90F40aF694209DEFC188B1", block: 100409410, hook: "0x5A171D4b748b75172fbC562C547Ee2201eF220Cc", splitter: "0xC09aD9537c0bd0E0A9831659332a3dA59Cce8055" },
      { factory: "0xD45D538AA6Ab9261A638b9Df83312f823BB368fC", block: 103445727, hook: "0x869642f4237fC027D141055eC683F37bacA0A0cC", splitter: "0x99BEC52EEbeB864E02E5BFc886423d041b820B87" },
    ],
    start: "2026-10-28",
  },
  [CHAIN.BASE]: {
    deployments: [
      // retired: factory deployed at block 53231785 (2026-10-29)
      { factory: "0x6Debac403C59b8b148677d971abE97815c5cB92b", block: 53231785, hook: "0x2340222345A0bb172BED0836Dd60C725Cf6FA0cc", splitter: "0x8F3d11EF646B4eBDD42fBFE7289ab9a78844aF09" },
      { factory: "0x7cdd6aCD10144C89B630Bce8b2031d80df57628c", block: 53375932, hook: "0x5a4D4781266439D20425c668fcadd8EECF3620cc", splitter: "0xde8eb4358d2b560608928DaDa47ca10faAf87850" },
    ],
    start: "2026-10-29",
  },
  [CHAIN.BSC]: {
    deployments: [
      // retired: factory deployed at block 128055780 (2026-10-16)
      { factory: "0x48E9f6E30E83037643Ff0614D2b5d79b1FFbcE45", block: 128055780, hook: "0xA4e65d9Dd587aBB129CCac7b2208cbeC340920cC", splitter: "0x1c05b7462EAa013b498935e245EBB1ab4FD015e7" },
      { factory: "0x71abe80C8f08ebE5dac018601170e687ED737AC3", block: 131062839, hook: "0x90736d933c9EACD863fE557C2B8AFB769263A0CC", splitter: "0xCbCD64e5bc8c796A4778631cB9a81375A6754B38" },
    ],
    start: "2026-10-28",
  },
  [CHAIN.ARC]: {
    deployments: [
      // retired: factory deployed at block 28430511 (2026-10-29)
      { factory: "0x52755b8ffc29D3d002fb63b76B851839bA04D6C9", block: 28430511, hook: "0x0e1bB1fB2bA05065E8a18cB58bB3a767804260CC", splitter: "0x4E292C3fcD918BB49fFEA0998725d224A74C68c7" },
      { factory: "0x11A5ac5fC2A1e7D4bF61B781b0b784462C2BD9e7", block: 28998006, hook: "0x05456d08625f554332769699ff0608f1E59A60cC", splitter: "0x1b304c1Ce20eE9531172342416538027BFd636b8" },
    ],
    start: "2026-10-29",
  },
  [CHAIN.ETHEREUM]: {
    deployments: [
      // retired: factory deployed at block 26293059, first launch (HOARD, 0xE390f4A1303d538262A682E02A0caccB325656a4) at block 26294198
      { factory: "0x789e4DE6b582695eC71f4Ba9377d6920Af50A031", block: 26293059, hook: "0x494cbCc04706a8669B96c8E1aD83b39dF8aCA0CC", splitter: "0xe820EE4ae5b14A27CF225dA78cb2D70c7995F951" },
      { factory: "0x2DC4f507BD30c6b5df90B288FaeCDeCE627386Ec", block: 26320476, hook: "0xD93a6B850748645DDB89A8dfd34c20057881e0cc", splitter: "0xBDF4D8b944eB42e6BBebc4de6b8C533506d79bB7" },
    ],
    start: "2026-10-28",
  },
  // Monad, Avalanche and Arbitrum One have one deployment each (2026-11-11), with the same factory and splitter address on all three.
  [CHAIN.MONAD]: {
    deployments: [
      { factory: "0xB2Aa70bF167AEc63DBC49f14F12d4301E5a3c2A8", block: 121283239, hook: "0x41f8B93F7193D08F66a1c4CB2056c858F02860cc", splitter: "0x48E9f6E30E83037643Ff0614D2b5d79b1FFbcE45" },
    ],
    start: "2026-11-11",
  },
  [CHAIN.AVAX]: {
    deployments: [
      { factory: "0xB2Aa70bF167AEc63DBC49f14F12d4301E5a3c2A8", block: 100053182, hook: "0x550B2DA2872cAa1138024C7fd240F6A4Ec60e0cc", splitter: "0x48E9f6E30E83037643Ff0614D2b5d79b1FFbcE45" },
    ],
    start: "2026-11-11",
  },
  [CHAIN.ARBITRUM]: {
    deployments: [
      { factory: "0xB2Aa70bF167AEc63DBC49f14F12d4301E5a3c2A8", block: 523406566, hook: "0x07C5151D69806477A50D71F1cd81494A9e1D20CC", splitter: "0x48E9f6E30E83037643Ff0614D2b5d79b1FFbcE45" },
    ],
    start: "2026-11-11",
  },
  // Polygon PoS has one deployment (2026-11-13), with the same factory and splitter address as Monad, Avalanche and Arbitrum One.
  [CHAIN.POLYGON]: {
    deployments: [
      { factory: "0xB2Aa70bF167AEc63DBC49f14F12d4301E5a3c2A8", block: 97230966, hook: "0xE161860d4387CD72d183E8d544aCF09d92B820CC", splitter: "0x48E9f6E30E83037643Ff0614D2b5d79b1FFbcE45" },
    ],
    start: "2026-11-13",
  },
};

// ALPHA launch program on Solana: https://solscan.io/account/r4yX8Q9Z5zSLY2fjoq1DgijfoHLru49zfikq79pa1fa
const SOLANA_PROGRAM = "r4yX8Q9Z5zSLY2fjoq1DgijfoHLru49zfikq79pa1fa";
const MARKET_DISCRIMINATOR = "dkokXHR3DTw";
const MARKET_SIZE = 914;
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

  // Half of the protocol fee is booked for operations and half for the ALPHA buyback, unless the event reports the split.
  const addFee = (quote: string, protocolFee: bigint, creatorFee: bigint, labels: string[], operationsFee = protocolFee / 2n) => {
    const [fees, toProtocol, toCreators] = labels;
    dailyFees.add(quote, protocolFee + creatorFee, fees);
    dailyRevenue.add(quote, protocolFee, toProtocol);
    dailySupplySideRevenue.add(quote, creatorFee, toCreators);
    dailyProtocolRevenue.add(quote, operationsFee, FEES_TO_OPERATIONS);
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
  const { deployments } = chainConfig[options.chain];
  const { addFee, dailyHoldersRevenue, result } = createFeeBalances(options);

  const factories = deployments.map((d) => d.factory);
  const fromBlock = Math.min(...deployments.map((d) => d.block));
  const launches = await options.getLogs({ targets: factories, eventAbi: LAUNCHED, fromBlock, cacheInCloud: true });
  const presetLogs = await options.getLogs({ targets: factories, eventAbi: FEE_PRESET_SELECTED, fromBlock, cacheInCloud: true });
  const poolFeeLogs = await options.getLogs({ targets: deployments.map((d) => d.hook), eventAbi: SWAP_FEE_COLLECTED });
  const buybackLogs = await options.getLogs({ targets: deployments.map((d) => d.splitter), eventAbi: BUYBACK_RELEASED });

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

  for (const log of poolFeeLogs) {
    addFee(log.quote, BigInt(log.protocolFee), BigInt(log.creatorFee), [POOL_FEES, POOL_FEES_TO_PROTOCOL, POOL_FEES_TO_CREATORS]);
  }

  // The buyback half counts when the chain shows it leaving the splitter for the burn executor, not when it accrues.
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
    SELECT 'curve' AS kind, SUBSTR(data, 17, 64) AS market_hex, NULL::VARCHAR AS quote_hex,
      ${u64("data", 129)} AS protocol_fee, ${u64("data", 137)} AS creator_fee, NULL::NUMBER AS operations_fee
    ${ofEvent(TRADE_EXECUTED)}
    UNION ALL
    SELECT 'pool', SUBSTR(data, 17, 64), SUBSTR(data, 161, 64),
      ${u64("data", 120)} + ${u64("data", 128)}, ${u64("data", 136)}, ${u64("data", 120)}
    ${ofEvent(POOL_FEES_SETTLED)}
  ),
  fees AS (
    SELECT kind, market_hex, quote_hex, SUM(protocol_fee)::VARCHAR AS protocol_fee, SUM(creator_fee)::VARCHAR AS creator_fee,
      SUM(operations_fee)::VARCHAR AS operations_fee
    FROM fee_events
    GROUP BY 1, 2, 3
  )
  SELECT checks.*,
    -- an event with a size it never had: its layout changed and the offsets above may no longer hold
    (${knownSize(TRADE_EXECUTED)}) + (${knownSize(POOL_FEES_SETTLED)}) AS unknown_layouts,
    fees.kind, fees.market_hex, fees.quote_hex, fees.protocol_fee, fees.creator_fee, fees.operations_fee
  FROM checks
  LEFT JOIN fees ON TRUE`);

  assertComplete(rows[0], "alpha-launchpad", options);
  if (Number(rows[0].unknown_layouts) > 0)
    throw new Error(`alpha-launchpad: ${rows[0].unknown_layouts} fee events with an unexpected size, their layout changed`);

  const feeRows = rows.filter((row: any) => row.market_hex);
  if (!feeRows.length) return result();

  // TradeExecuted names the market, not the quote asset, so map market to quote mint
  const quoteMints: Record<string, string> = {};
  if (feeRows.some((row: any) => row.kind === "curve")) {
    const markets = await getProgramAccounts({
      programId: SOLANA_PROGRAM,
      encoding: "base64",
      filters: [{ dataSize: MARKET_SIZE }, { memcmp: { offset: 0, bytes: MARKET_DISCRIMINATOR } }],
      dataSlice: { offset: MARKET_QUOTE_MINT_OFFSET, length: 32 },
    });
    markets.forEach((market: any) => {
      quoteMints[market.pubkey] = base58Encode(Buffer.from(market.account.data[0], "base64"));
    });
  }

  for (const row of feeRows) {
    if (row.kind === "pool") {
      const quote = base58Encode(Buffer.from(row.quote_hex, "hex"));
      addFee(quote, BigInt(row.protocol_fee), BigInt(row.creator_fee), [POOL_FEES, POOL_FEES_TO_PROTOCOL, POOL_FEES_TO_CREATORS], BigInt(row.operations_fee));
      continue;
    }
    const market = base58Encode(Buffer.from(row.market_hex, "hex"));
    const quote = quoteMints[market];
    if (!quote) throw new Error(`alpha-launchpad: fee event for unknown market ${market}`);
    addFee(quote, BigInt(row.protocol_fee), BigInt(row.creator_fee), [CURVE_FEES, CURVE_FEES_TO_PROTOCOL, CURVE_FEES_TO_CREATORS]);
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
