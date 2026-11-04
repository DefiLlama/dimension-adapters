import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

const fetch = async (options: FetchOptions) => {
  const { factory, block, hook, splitter } = chainConfig[options.chain];
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
    // ProtocolRevenueSplitter.deposit books half for operations and half for the ALPHA buyback.
    dailyProtocolRevenue.add(quote, protocolFee / 2n, FEES_TO_OPERATIONS);
  };

  const launches = await options.getLogs({ target: factory, eventAbi: LAUNCHED, fromBlock: block, cacheInCloud: true });
  const presetLogs = await options.getLogs({ target: factory, eventAbi: FEE_PRESET_SELECTED, fromBlock: block, cacheInCloud: true });
  const presets: Record<string, number> = {};
  for (const log of presetLogs) presets[log.market.toLowerCase()] = Number(log.preset);

  if (launches.length) {
    const markets = launches.map((launch: any) => launch.market);
    const tradeLogs = await options.getLogs({ targets: markets, eventAbi: TRADE, flatten: false });

    tradeLogs.forEach((trades: any[], i: number) => {
      const creatorBps = CREATOR_FEE_BPS[presets[markets[i].toLowerCase()]];
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

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by traders on bonding curves and on graduated pools: a 1% protocol fee plus a creator fee of 0, 0.25 or 0.5%.",
  UserFees: "Trading fees paid by traders on bonding curves and on graduated pools.",
  Revenue: "The 1% protocol fee taken on every trade.",
  SupplySideRevenue: "The creator fee of 0, 0.25 or 0.5% paid to the token creator on every trade.",
  ProtocolRevenue: "Half of the 1% protocol fee, booked for operations.",
  HoldersRevenue: "The other half of the protocol fee, counted when it is released on chain to the executor that buys back and burns ALPHA. Amounts booked for the buyback but not yet released are not counted.",
};

const breakdownMethodology = {
  Fees: {
    [CURVE_FEES]: "Protocol and creator fees paid on bonding curve trades.",
    [POOL_FEES]: "Protocol and creator fees charged by the ALPHA hook on graduated Uniswap v4 pools.",
  },
  UserFees: {
    [CURVE_FEES]: "Protocol and creator fees paid on bonding curve trades.",
    [POOL_FEES]: "Protocol and creator fees charged by the ALPHA hook on graduated Uniswap v4 pools.",
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
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
