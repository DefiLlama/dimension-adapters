import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// EL-Casino Launchpad (https://elcas.app/#/launch) — ElcasLaunchpad 0xAeB56aEdA96d56d43Eee63658397BAC3f950B6be on
// Robinhood Chain, live 2026-10-24 (source verified on Sourcify). A launch mints 1B tokens: 90 % go into the token's own
// TOKEN/WETH 1 % Uniswap V3 pool as a position the launchpad owns forever (locked), 10 % to its game reserve, which opens
// a casino room for the token in every EL-Casino game and, once the pool holds 4.2 WETH, its perps and predict markets.
//
// Fees:
//   · the 1 % Uniswap V3 fee of every trade in a launch token's pool: the launchpad's position earns it, and collect(token)
//     pulls it and splits it in three in the same transaction (FeesCollected: tokens / weth = the whole collect,
//     creatorTokens / creatorWeth = one third): a third to the token's creator, a third to the ElcasBurner (sells it for
//     ETH, buys $ELCAS and burns it), the rest to the game reserve, which donates it to the token's casino rooms and
//     markets (their stakers). Counted when collected.
//   · the launch fee: a fixed amount of ETH (launchFee(), immutable) sent straight to the ElcasBurner by every launch.
// No TVL: the pools' liquidity is Uniswap V3 liquidity. Until 2026-10-26 these pool fees were counted under the
// el-casino fees adapter, which now leaves them to this listing.
//
// Launchpad V3 (ElcasLaunchpadV3 0xA252B4A33CC9501b0B3918cB81B5A5E6db682a43, 2026-10-28) replaced it: every launch trades
// on its own Uniswap v4 pool with the ElcasLaunchHook (0xBdD854c9eC87dC99B695F6c72Ab1320af4322ACc), which takes a fixed
// 3 % of every swap in the quote asset (native ETH, or a tokenized stock / stable the owner listed). process(token) splits
// it (Processed): toBurner → the ElcasBurnerV3 (buys and burns $ELCAS) · toLps → buys the token back for its rooms' and
// markets' stakers · toCreatorOrHolders → the creator, or an index of tokenized stocks paid to the token's holders ·
// keeperReward → the caller (out of the burn third, ETH pools only). The launch fee (quotes(quote).launchFee) of an ETH
// launch funds the keepers that open the token's rooms and markets; of any other quote it goes to the burner.

const LAUNCHPAD = "0xAeB56aEdA96d56d43Eee63658397BAC3f950B6be";
const LAUNCHPAD_V3 = "0xA252B4A33CC9501b0B3918cB81B5A5E6db682a43";
const NATIVE = ADDRESSES.null;
const PROCESSED = "event Processed(address indexed token, uint256 amount, uint256 toBurner, uint256 toLps, uint256 toCreatorOrHolders, uint256 keeperReward)";
const LAUNCHED_V3 = "event Launched(address indexed token, address indexed creator, address indexed quote, address poolView, bool holders)";
const LAUNCHES_V3 = "function launches(address) view returns (address creator, address quote, address poolView, bool tokenIs0, bool holders, uint64 launchedAt, uint32 window, uint16 maxTxBps, uint16 maxWalletBps, bytes32 root, int24 tickLower, int24 tickUpper, uint128 liquidity)";
const QUOTES_V3 = "function quotes(address) view returns (bool allowed, int24 openTick, uint256 launchFee, uint256 gradAmount)";
const WETH = ADDRESSES.robinhood.WETH;
const FEES_COLLECTED = "event FeesCollected(address indexed token, uint256 tokens, uint256 weth, uint256 creatorTokens, uint256 creatorWeth)";
const LAUNCHED = "event Launched(address indexed token, address indexed creator, address pool, uint256 positionId, uint256 initialBuy, string name, string symbol)";

const L = {
  poolFees: "Launch Token Pool Fees",
  launchFees: "Token Launch Fees",
  poolToCreators: "Pool Fees To Token Creators",
  poolToGames: "Pool Fees To The Token's Game Stakers",
  poolToBurn: "Pool Fees To ELCAS Buyback And Burn",
  launchToBurn: "Launch Fees To ELCAS Buyback And Burn",
  hookFees: "Launch Token Trading Fees",
  hookToBurn: "Trading Fees To ELCAS Buyback And Burn",
  hookToGames: "Trading Fees To The Token's Game Stakers",
  hookToCreators: "Trading Fees To Token Creators Or Holders",
  hookToKeepers: "Trading Fees To Keepers",
  launchToKeepers: "Launch Fees To Keepers",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // pool fees, in the launch token (sells pay the fee in it) and in WETH (buys): a third each to the creator, the
  // games and the burn — the contract takes the creator's and the burner's third as total / 3, the games get the rest
  const collects = await options.getLogs({ target: LAUNCHPAD, eventAbi: FEES_COLLECTED });
  const split = (token: string, total: bigint, third: bigint) => {
    dailyFees.add(token, total, L.poolFees);
    dailySupplySideRevenue.add(token, third, L.poolToCreators);
    dailySupplySideRevenue.add(token, total - 2n * third, L.poolToGames);
    dailyRevenue.add(token, third, L.poolToBurn);
  };
  collects.forEach((c: any) => {
    split(c.token, BigInt(c.tokens), BigInt(c.creatorTokens));
    split(WETH, BigInt(c.weth), BigInt(c.creatorWeth));
  });

  // the launch fee of every launch in the window
  const launches = await options.getLogs({ target: LAUNCHPAD, eventAbi: LAUNCHED });
  if (launches.length) {
    const fee = BigInt(await options.toApi.call({ target: LAUNCHPAD, abi: "uint256:launchFee" }));
    dailyFees.add(WETH, fee * BigInt(launches.length), L.launchFees);
    dailyRevenue.add(WETH, fee * BigInt(launches.length), L.launchToBurn);
  }

  // launchpad V3: the hook's 3 % fee, split by process(); the quote asset of each token from the launchpad
  const processed = await options.getLogs({ target: LAUNCHPAD_V3, eventAbi: PROCESSED });
  if (processed.length) {
    const toks = [...new Set(processed.map((x: any) => String(x.token)))];
    const ls = await options.toApi.multiCall({ abi: LAUNCHES_V3, target: LAUNCHPAD_V3, calls: toks });
    const quoteOf = new Map(toks.map((t, i) => [t, String(ls[i].quote)]));
    processed.forEach((x: any) => {
      const q = quoteOf.get(String(x.token)) ?? NATIVE;
      dailyFees.add(q, x.amount, L.hookFees);
      dailyRevenue.add(q, x.toBurner, L.hookToBurn);
      dailySupplySideRevenue.add(q, x.toLps, L.hookToGames);
      dailySupplySideRevenue.add(q, x.toCreatorOrHolders, L.hookToCreators);
      dailySupplySideRevenue.add(q, x.keeperReward, L.hookToKeepers);
    });
  }
  const launchedV3 = await options.getLogs({ target: LAUNCHPAD_V3, eventAbi: LAUNCHED_V3 });
  if (launchedV3.length) {
    const qs = [...new Set(launchedV3.map((x: any) => String(x.quote)))];
    const cfg = await options.toApi.multiCall({ abi: QUOTES_V3, target: LAUNCHPAD_V3, calls: qs });
    const feeOf = new Map(qs.map((q, i) => [q, BigInt(cfg[i].launchFee)]));
    launchedV3.forEach((x: any) => {
      const q = String(x.quote), fee = feeOf.get(q) ?? 0n;
      dailyFees.add(q, fee, L.launchFees);
      if (q.toLowerCase() === NATIVE.toLowerCase()) dailySupplySideRevenue.add(q, fee, L.launchToKeepers);
      else dailyRevenue.add(q, fee, L.launchToBurn);
    });
  }

  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyHoldersRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const methodology = {
  Fees: "The 3% fee of every trade in a launchpad V3 token's Uniswap v4 pool (taken by the launch hook in the quote asset), the 1% Uniswap V3 fee of the older launchpad's pools, plus the fee paid for every token launch.",
  UserFees: "Traders pay the pool fee; token creators pay the launch fee.",
  Revenue: "The platform's third of the trading / pool fees (minus the V3 keeper reward) and the launch fees sent to the burner (V6, and V3 launches in a non-ETH quote).",
  HoldersRevenue: "The ElcasBurner sells what it receives for ETH, buys $ELCAS and burns it.",
  SupplySideRevenue: "A third of the fees to the token's creator (or, V3, as a tokenized-stock index to its holders), a third to the token's casino rooms and perps / predict markets (their stakers), the V3 keeper rewards, and the ETH launch fees of V3 that pay the keepers opening each token's rooms and markets.",
};

const breakdownMethodology = {
  Fees: {
    [L.hookFees]: "3% fee of every trade in a launchpad V3 token's Uniswap v4 pool, taken by the launch hook in the quote asset.",
    [L.poolFees]: "1% fee of every trade in a launchpad token's Uniswap V3 pool, collected by the launchpad.",
    [L.launchFees]: "Fixed ETH fee (launchFee) paid with every token launch.",
  },
  UserFees: {
    [L.hookFees]: "3% fee of every trade in a launchpad V3 token's pool, paid by traders.",
    [L.poolFees]: "1% fee of every trade in a launchpad token's Uniswap V3 pool, paid by traders.",
    [L.launchFees]: "Fixed ETH fee paid by the token's creator at launch.",
  },
  Revenue: {
    [L.hookToBurn]: "A third of the V3 trading fees (minus the keeper reward), sent to the ElcasBurnerV3, which buys and burns $ELCAS.",
    [L.poolToBurn]: "A third of the pool fees, sent to the ElcasBurner, which buys and burns $ELCAS.",
    [L.launchToBurn]: "The launch fee, sent to the ElcasBurner, which buys and burns $ELCAS.",
  },
  HoldersRevenue: {
    [L.hookToBurn]: "A third of the V3 trading fees (minus the keeper reward), sent to the ElcasBurnerV3, which buys and burns $ELCAS.",
    [L.poolToBurn]: "A third of the pool fees, sent to the ElcasBurner, which buys and burns $ELCAS.",
    [L.launchToBurn]: "The launch fee, sent to the ElcasBurner, which buys and burns $ELCAS.",
  },
  SupplySideRevenue: {
    [L.hookToCreators]: "A third of the V3 trading fees: to the token's creator, or bought as a tokenized-stock index and paid to its holders.",
    [L.hookToGames]: "A third of the V3 trading fees, buying the token back for its casino rooms and perps / predict markets — earned by their stakers.",
    [L.hookToKeepers]: "The caller of process(): 4x its gas, at most 10% of the fee processed, out of the burn third.",
    [L.launchToKeepers]: "The ETH launch fee of a V3 launch: the keeper budget that pays whoever opens the token's rooms and markets.",
    [L.poolToCreators]: "A third of the pool fees, paid to the token's creator.",
    [L.poolToGames]: "A third of the pool fees, donated to the token's casino rooms and perps / predict markets — earned by their stakers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-24",
  methodology,
  breakdownMethodology,
};

export default adapter;
