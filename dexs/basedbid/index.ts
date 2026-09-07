import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// BasedBid core diamond per EVM chain. The bonding curve lives in its TradeFacet.
const chainConfig: Record<string, { CORE_CONTRACT: string; start: string }> = {
  [CHAIN.ETHEREUM]: { CORE_CONTRACT: "0x3cb3D9E659653de02D8e3Aecd4963Ba1Ae429682", start: "2025-11-17" },
  [CHAIN.BSC]: { CORE_CONTRACT: "0x920b4Ee4970CFE1ef523a0679200f9d9b2F87B2c", start: "2025-11-17" },
  [CHAIN.BASE]: { CORE_CONTRACT: "0x0F2C33F406D58144Dec03FCdb69571249F0b0286", start: "2025-11-17" },
  [CHAIN.MEGAETH]: { CORE_CONTRACT: "0x695e175c9704432cdFB98e3C193966F95a5F119D", start: "2026-02-09" },
  [CHAIN.ROBINHOOD]: { CORE_CONTRACT: "0x6EC95a3C6C7b8368C9bF37Ff664672E55df3550d", start: "2026-07-09" },
};

const DEX_STRUCT =
  "(address routerOrPositionManager, uint256 poolId, uint24 fee, int24 tickSpacing, uint24 per, bool isLPBurn, uint8 _padding)[] dex";
const INITIAL_DATA_STRUCT =
  `(address baseTokenForPair, uint256 liquidityForHardcap, uint256 liquidityForSoftcap, uint256 marketCap, uint256 maxAllocationPerUser, uint256 maxAllocationPerWhitelistedUser, bytes32 whitelistMerkleRoot, uint24 buyReferralFeePer, uint24 sellMemeTokenOwnerFeePer, uint24 buyMemeTokenOwnerFeePer, uint24 finalizeFeePer, uint24 delayTradeTime, uint40 startTime, uint40 endTime, bool isWhitelist, uint48 _padding, ${DEX_STRUCT}, string metaData) initialData`;
const FEE_STRUCT =
  "(uint256 listingFee, uint256 listingReferralFee, uint24 buyFeePer, uint24 sellFeePer, uint24 finalizeFeePer, uint24 flashLaunchFeePer, uint24 tradingFeeAfterLaunchPer, uint8 _padding) fee";

const ABI = {
  // Emitted by TradeFacet (and by CreationFacet for the creator's initial buy, with an
  // identical signature). amountIn is the base-token leg, amountOut the meme-token leg.
  bought:
    "event Bought(address indexed buyer, address indexed memeToken, address referrer, uint256 amountIn, uint256 amountOut, uint256 amountOwnerFee, uint256 amountSubBoardFee, uint256 amountMemeTokenOwnerFee, uint256 amountReferralFee, uint256 volumn, uint256 virtualReserveETH, uint256 virtualReserveToken, bool isHardCapReached, uint8 decimals, uint256 virtualReserveETHHardcap, uint256 virtualReserveETHSoftcap)",
  // amountIn is the meme-token leg; amountOut is the base-token leg paid to the seller,
  // already net of the three fee shares that the curve withholds from it.
  sold:
    "event Sold(address indexed seller, address indexed memeToken, uint256 amountIn, uint256 amountOut, uint256 amountOwnerFee, uint256 amountSubBoardFee, uint256 amountMemeTokenOwnerFee, uint256 volumn, uint256 virtualReserveETH, uint256 virtualReserveToken, bool isHardCapReached, uint8 decimals, uint256 virtualReserveETHHardcap, uint256 virtualReserveETHSoftcap)",
  getMemeTokenData: `function getMemeTokenData(address memeToken) view returns ((address memeOwner, uint256 volumn, uint256 virtualReserveETH, uint256 virtualReserveToken, uint256 initialVirtualReserveETH, uint256 initialVirtualReserveToken, uint256 virtualReserveETHHardcap, uint256 virtualReserveETHSoftcap, bytes32 subBoard, bytes32 keyForXSale, uint8 package, bool isXSale, bool isListed, bool isCancelled, bool isTaxToken, uint8 _padding, ${INITIAL_DATA_STRUCT}, ${FEE_STRUCT}, uint256 tokenVersion))`,
};

// Each meme token is priced in the base token chosen at creation: the chain's native coin
// (stored as the zero address, or as WETH which the curve still settles natively) or an
// arbitrary ERC20. The Bought/Sold events carry only raw amounts, so the base token is
// read from the diamond for every meme token traded in the period.
const getBaseTokens = async (options: FetchOptions, core: string, memeTokens: string[]) => {
  const baseTokens: Record<string, string> = {};
  if (!memeTokens.length) return baseTokens;

  const results = await options.api.multiCall({
    abi: ABI.getMemeTokenData,
    calls: memeTokens.map((memeToken) => ({ target: core, params: [memeToken] })),
    permitFailure: true,
  });

  results.forEach((data: any, i: number) => {
    if (!data) return;
    const baseToken = data?.initialData?.baseTokenForPair;
    // A failed or undecodable read falls back to the native coin, which is the base token
    // for the overwhelming majority of launches.
    baseTokens[memeTokens[i]] = typeof baseToken === "string" ? baseToken.toLowerCase() : ZERO_ADDRESS;
  });

  return baseTokens;
};

const fetchEVM = async (options: FetchOptions) => {
  const { CORE_CONTRACT: core } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();

  const [boughtLogs, soldLogs] = await Promise.all([
    options.getLogs({ target: core, eventAbi: ABI.bought }),
    options.getLogs({ target: core, eventAbi: ABI.sold }),
  ]);

  // Volume is the gross base-token leg of each trade, fees included, on both sides: a buy
  // pays amountIn gross and the curve withholds its fees from it, whereas a sell's
  // amountOut is already net, so the withheld shares are added back.
  const trades = [
    ...boughtLogs.map((log: any) => ({
      memeToken: String(log.memeToken).toLowerCase(),
      amount: BigInt(log.amountIn),
    })),
    ...soldLogs.map((log: any) => ({
      memeToken: String(log.memeToken).toLowerCase(),
      amount:
        BigInt(log.amountOut) +
        BigInt(log.amountOwnerFee) +
        BigInt(log.amountSubBoardFee) +
        BigInt(log.amountMemeTokenOwnerFee),
    })),
  ];

  const baseTokens = await getBaseTokens(options, core, [...new Set(trades.map((t) => t.memeToken))]);

  trades.forEach(({ memeToken, amount }) => {
    const baseToken = baseTokens[memeToken];
    if (baseToken === ZERO_ADDRESS) dailyVolume.addGasToken(amount);
    else dailyVolume.add(baseToken, amount);
  });

  return { dailyVolume };
};

// BasedBid bonding-curve launchpad program on Solana.
const SOLANA_PROGRAM = "CuodpYRDz4k87K6ZUFxk7X8JkVv5dNVZAcTQX2TEzTef";
// Hardcoded admin wallet receiving the protocol fee share — excluded so fees are not
// counted as trade principal.
const SOLANA_FEE_WALLET = "8umVV7k9HoVm4yy5DiRtKSH5qbKtw8xWDARGX8QiLfLe";
// Post-graduation DEX programs: transactions touching these are pool finalization or
// LP fee claims, not bonding-curve trades (that volume belongs to Raydium/Meteora).
const DEX_PROGRAMS = [
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", // Raydium CPMM
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", // Raydium CLMM
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG", // Meteora DAMM v2
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo", // Meteora DLMM
];
const BASE_MINTS = [
  ADDRESSES.solana.SOL,
  ADDRESSES.solana.USDC,
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1
];

// A bonding-curve buy moves the trade principal from the trader to the pool account
// (plus smaller percentage fees to admin/sub-board/referrer wallets); a sell moves the
// principal from the pool back to the trader. Per transaction the largest base-token
// transfer that does not touch the admin fee wallet is the trade principal.
const fetchSolana = async (options: FetchOptions) => {
  const rows = await queryAllium(`
    WITH program_txs AS (
      SELECT txn_id
      FROM solana.raw.transactions
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND success = true
        AND ARRAY_CONTAINS('${SOLANA_PROGRAM}'::VARIANT, TRANSFORM(account_keys, x -> x:pubkey))
        ${DEX_PROGRAMS.map((p) => `AND NOT ARRAY_CONTAINS('${p}'::VARIANT, TRANSFORM(account_keys, x -> x:pubkey))`).join("\n        ")}
    ),
    trade_amounts AS (
      SELECT tr.txn_id, MAX(tr.usd_amount) AS trade_usd
      FROM solana.assets.transfers tr
      JOIN program_txs p ON p.txn_id = tr.txn_id
      WHERE tr.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND tr.block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND tr.mint IN (${BASE_MINTS.map((m) => `'${m}'`).join(", ")})
        AND tr.to_address != '${SOLANA_FEE_WALLET}'
        AND tr.from_address != '${SOLANA_FEE_WALLET}'
        AND tr.to_address != tr.from_address
      GROUP BY tr.txn_id
    )
    SELECT COALESCE(SUM(trade_usd), 0) AS daily_volume FROM trade_amounts
    `
  )

  return { dailyVolume: Number(rows[0].daily_volume) };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetchEVM,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    ...chainConfig,
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: "2025-12-24",
    },
  },
  methodology: {
    Volume:
      "Bonding-curve trade volume on BasedBid. On EVM chains it is the base-token leg of every Bought and Sold event emitted by the core diamond's TradeFacet — the base token paid in on a buy and paid out on a sell — priced in the base token configured for each meme token (native coin or ERC20). On Solana it is, per trade, the base-token (SOL/USDC/USD1) amount moved between the trader and the bonding-curve pool. Post-graduation trading is excluded on both: the curve stops emitting once a token lists, and that volume belongs to the DEX it graduated to.",
  },
};

export default adapter;
