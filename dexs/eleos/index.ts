import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { dedupeLogs } from "../../helpers/elyspump";

// eleos (https://eleos.fun, docs https://eleos.fun/docs and https://eleos.fun/docs/integrate) is a token launchpad on Elysium.
// Every coin trades in one Uniswap v4 pool on eleos's own PoolManager, whose hook is an eleos hook. The pool's LP fee is 0 and
// its liquidity is locked in the hook; instead the hook charges the coin's buy/sell tax (0-10%, set at launch, can only be
// lowered; plus an anti-snipe extra on early buys) in the pool's pair asset and logs it as Taxed on every taxed trade. The tax
// collects in the hook and is later split by process(): platformBps() (20%) to the eleos platform wallet, the rest as the coin's
// config() sets it between the creator, HYPE dividends for the coin's holders, buyback-and-burn of the coin and locked
// liquidity; anti-snipe extras above the base tax go to buyback-and-burn after the platform share (docs, "Anti-snipe").
// Contract sources are not published: event signatures were matched against on-chain topic0s and the view signatures come
// from the eleos.fun app bundle. A coin's Taxed amounts sum to the hook's totals(token).tax (EOS: 39.277 HYPE up to
// 2026-11-12), and every Processed split logs platform = 20% of the tax.
//
// Volume is launchpad volume only: trades on the EleosCurve bonding curve (1% fee per trade, to the platform), where a "Curve"
// coin trades until the curve sells out at target() = 85.005 HYPE. The buy that fills it opens the coin's pool on eleos's
// PoolManager in the same transaction (docs, "Curve or straight to pool"; EleosCurve.poolManager() = 0x5c54…37Da and
// hook() = EleosHook). Trades in the PoolManager pools are post-launch DEX trading and are not volume here; only their taxes
// count as fees. No curve coin had filled by 2026-11-12, and "straight to pool" coins never use the curve.
//
// Addresses are the ones in eleos's app config (window.__ELEOS__ on every eleos.fun page) and docs. The PoolManager
// (0x5c54A7293D96B11a29A0256eE8dfdBC3059637Da), hooks, curve and router were all deployed by
// 0x95312d8f1caf3ad4350d89b504cbad680de26330. Other hooks that third parties attached to eleos's PoolManager (e.g.
// 0x601bdb66b0285c199b43479030a9132f6dd8aaec, deployed by another wallet) are not eleos launches.
const HOOKS = [
  "0x8680965555DCEa2a4c0Ed3a29e59a8AA424E6acC", // EleosHook: every HYPE-paired coin
  "0xb0dcb98508173C29AD57Df444EE3e91fc681aacc", // QuoteHook: coins paired with KNTQ, USDC, EOS or an xStock
  "0x6BcDf22D303C029805a733270E450C99E1DbAACC", // pairs hook (app config modes.pairs.HOOK)
  "0x1D1Cfb5942AF45a28c5F2EEFb5CAdA9E0e9fEaCC", // first deployment of the pairs hook bytecode (4 pools, 2026-11-02)
].map((a) => a.toLowerCase());
const CURVE = "0x373bb92a4bbB4cBF6fF1280e39fD4b1F1822386b"; // EleosCurve, HYPE bonding curve
const EOS = "0x20e35aa83473acbc736fd178550845c640b8ce0d";
const NATIVE = ADDRESSES.null;
const BPS = 10_000n;

const TAXED = "event Taxed(address indexed token, bool isBuy, uint256 amount, uint256 snipe)";
const CURVE_TRADE = "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 hype, uint256 tokens, uint256 fee, uint256 reserveHype, uint256 reserveTokens)";
const CONFIG = "function config(address token) view returns ((address creator, uint16 buyBps, uint16 sellBps, uint16 creatorBps, uint16 holdersBps, uint16 buybackBps, uint16 lpBps, uint32 snipeSecs))";
const KEY_FOR = "function keyFor(address token) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))";

const LABEL = {
  taxes: "Trading Taxes",
  snipeTaxes: "Anti-Snipe Taxes",
  curveFees: "Bonding Curve Fees",
  taxesToPlatform: "Trading Taxes To Platform",
  snipeToPlatform: "Anti-Snipe Taxes To Platform",
  curveToPlatform: "Bonding Curve Fees To Platform",
  toCreators: "Trading Taxes To Coin Creators",
  toHolders: "Trading Taxes To Coin Holders",
  toBuybacks: "Trading Taxes To Coin Buyback And Burn",
  toLiquidity: "Trading Taxes To Coin Locked Liquidity",
  snipeToBuybacks: "Anti-Snipe Taxes To Coin Buyback And Burn",
  eosToTeam: "EOS Taxes To Team",
  eosToHolders: "EOS Taxes To EOS Holders",
  eosToBuyback: "EOS Taxes To EOS Buyback And Burn",
  eosToLiquidity: "EOS Taxes To EOS Locked Liquidity",
};

const lower = (a: string) => String(a).toLowerCase();

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const add = (balances: any, currency: string, amount: bigint, label?: string) => {
    if (amount === 0n) return;
    if (currency === NATIVE) balances.addGasToken(amount, label);
    else balances.add(currency, amount, label);
  };

  const curveTrades = dedupeLogs(await options.getLogs({ target: CURVE, eventAbi: CURVE_TRADE, onlyArgs: false }));
  for (const { args } of curveTrades) {
    const fee = BigInt(args.fee);
    add(dailyVolume, NATIVE, args.isBuy ? BigInt(args.hype) : BigInt(args.hype) + fee);
    add(dailyFees, NATIVE, fee, LABEL.curveFees);
    add(dailyRevenue, NATIVE, fee, LABEL.curveToPlatform);
    add(dailyProtocolRevenue, NATIVE, fee, LABEL.curveToPlatform);
  }

  const taxes = dedupeLogs(await options.getLogs({ targets: HOOKS, eventAbi: TAXED, onlyArgs: false }));
  const coinKey = (hook: string, token: string) => `${hook}-${token}`;
  const coins: Record<string, { hook: string; token: string }> = {};
  for (const log of taxes) {
    const hook = lower(log.address), token = lower(log.args.token);
    if (!HOOKS.includes(hook)) throw new Error(`eleos: Taxed from unexpected address ${hook}`);
    coins[coinKey(hook, token)] = { hook, token };
  }
  const coinList = Object.values(coins);
  const calls = coinList.map(({ hook, token }) => ({ target: hook, params: [token] }));
  const keys = await options.api.multiCall({ abi: KEY_FOR, calls });
  const configs = await options.api.multiCall({ abi: CONFIG, calls });
  const hooksTaxed = [...new Set(coinList.map((c) => c.hook))];
  const platformBpsOf: Record<string, bigint> = {};
  (await options.api.multiCall({ abi: "uint16:platformBps", calls: hooksTaxed })).forEach((bps: any, i: number) => { platformBpsOf[hooksTaxed[i]] = BigInt(bps); });

  const coinInfo: Record<string, { quote: string; config: any }> = {};
  coinList.forEach(({ hook, token }, i) => {
    const key = keys[i];
    const currency0 = lower(key.currency0), currency1 = lower(key.currency1);
    if (lower(key.hooks) !== hook || (currency0 !== token && currency1 !== token)) throw new Error(`eleos: keyFor(${token}) on ${hook} is not the coin's pool`);
    const config = configs[i];
    if (BigInt(config.creatorBps) + BigInt(config.holdersBps) + BigInt(config.buybackBps) + BigInt(config.lpBps) !== BPS)
      throw new Error(`eleos: config(${token}) split does not sum to 100%`);
    coinInfo[coinKey(hook, token)] = { quote: currency0 === token ? currency1 : currency0, config };
  });

  for (const log of taxes) {
    const hook = lower(log.address), token = lower(log.args.token);
    const { quote, config } = coinInfo[coinKey(hook, token)];
    const amount = BigInt(log.args.amount), snipe = BigInt(log.args.snipe);
    if (snipe > amount) throw new Error(`eleos: anti-snipe extra above the tax in tx ${log.transactionHash}`);
    const base = amount - snipe;
    const platformBps = platformBpsOf[hook];
    const basePlatform = base * platformBps / BPS, snipePlatform = snipe * platformBps / BPS;
    const rest = base - basePlatform, snipeRest = snipe - snipePlatform;
    const holders = rest * BigInt(config.holdersBps) / BPS;
    const buyback = rest * BigInt(config.buybackBps) / BPS;
    const lp = rest * BigInt(config.lpBps) / BPS;
    const creator = rest - holders - buyback - lp;

    add(dailyFees, quote, base, LABEL.taxes);
    add(dailyFees, quote, snipe, LABEL.snipeTaxes);
    for (const b of [dailyRevenue, dailyProtocolRevenue]) {
      add(b, quote, basePlatform, LABEL.taxesToPlatform);
      add(b, quote, snipePlatform, LABEL.snipeToPlatform);
    }
    if (hook === HOOKS[0] && token === EOS) {
      for (const b of [dailyRevenue, dailyProtocolRevenue]) {
        add(b, quote, creator, LABEL.eosToTeam);
        add(b, quote, lp, LABEL.eosToLiquidity);
      }
      for (const b of [dailyRevenue, dailyHoldersRevenue]) {
        add(b, quote, holders, LABEL.eosToHolders);
        add(b, quote, buyback + snipeRest, LABEL.eosToBuyback);
      }
    } else {
      add(dailySupplySideRevenue, quote, creator, LABEL.toCreators);
      add(dailySupplySideRevenue, quote, holders, LABEL.toHolders);
      add(dailySupplySideRevenue, quote, buyback, LABEL.toBuybacks);
      add(dailySupplySideRevenue, quote, lp, LABEL.toLiquidity);
      add(dailySupplySideRevenue, quote, snipeRest, LABEL.snipeToBuybacks);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Volume: "Value of trades on the eleos bonding curve before a coin moves to its pool, in HYPE and before the 1% curve fee. Trading in the coins' pools after launch is not counted as volume.",
  Fees: "Buy and sell taxes paid by traders on every eleos coin trade (set per coin at launch, up to 10% each way, including the anti-snipe extra on early buys), plus the 1% fee on bonding-curve trades.",
  UserFees: "Buy and sell taxes and bonding-curve fees paid by traders on eleos coins.",
  Revenue: "The platform's 20% of every tax and all bonding-curve fees, plus everything the tax on EOS (eleos's own coin) pays to the team, to EOS holders, to EOS buyback-and-burn and into the locked EOS pool.",
  ProtocolRevenue: "The platform's 20% of every tax and all bonding-curve fees, sent to the eleos platform wallet, plus the team's share of the EOS tax and the share of it locked into the EOS pool.",
  HoldersRevenue: "The part of the tax on EOS (eleos's own coin) paid to EOS holders as HYPE dividends or used to buy back and burn EOS.",
  SupplySideRevenue: "The 80% of every coin's tax that goes, as the coin's creator chose, to the creator, to HYPE dividends for the coin's holders, to buyback-and-burn of the coin and to the coin's locked liquidity (EOS excluded).",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.taxes]: "The coin's buy/sell tax on every taxed trade in an eleos pool, paid in the pool's pair asset, from the hooks' Taxed events.",
    [LABEL.snipeTaxes]: "Extra tax on buys right after launch (starting at 50% and falling to the coin's tax over the anti-snipe window).",
    [LABEL.curveFees]: "1% fee on every buy and sell on the eleos bonding curve.",
  },
  UserFees: {
    [LABEL.taxes]: "The coin's buy/sell tax paid by traders on every taxed trade in an eleos pool.",
    [LABEL.snipeTaxes]: "Extra anti-snipe tax paid on buys right after launch.",
    [LABEL.curveFees]: "1% fee paid by traders on the eleos bonding curve.",
  },
  Revenue: {
    [LABEL.taxesToPlatform]: "20% of every coin tax, kept by the eleos platform.",
    [LABEL.snipeToPlatform]: "20% of every anti-snipe extra, kept by the eleos platform.",
    [LABEL.curveToPlatform]: "All bonding-curve fees, kept by the eleos platform.",
    [LABEL.eosToTeam]: "The creator share of the EOS tax, paid to the eleos team wallet.",
    [LABEL.eosToLiquidity]: "The liquidity share of the EOS tax, added to the EOS pool and locked there for good.",
    [LABEL.eosToHolders]: "The holders share of the EOS tax, paid to EOS holders as HYPE dividends.",
    [LABEL.eosToBuyback]: "The buyback share of the EOS tax, used to buy back and burn EOS.",
  },
  ProtocolRevenue: {
    [LABEL.taxesToPlatform]: "20% of every coin tax, paid to the eleos platform wallet.",
    [LABEL.snipeToPlatform]: "20% of every anti-snipe extra, paid to the eleos platform wallet.",
    [LABEL.curveToPlatform]: "All bonding-curve fees, paid to the eleos platform wallet.",
    [LABEL.eosToTeam]: "The creator share of the EOS tax, paid to the eleos team wallet.",
    [LABEL.eosToLiquidity]: "The liquidity share of the EOS tax, added to the EOS pool and locked there for good.",
  },
  HoldersRevenue: {
    [LABEL.eosToHolders]: "The holders share of the EOS tax, paid to EOS holders as HYPE dividends.",
    [LABEL.eosToBuyback]: "The buyback share of the EOS tax, used to buy back and burn EOS.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "The creator share of a coin's tax, paid to its creator (for Stocks coins, to the StocksVault that buys the coin's stock token).",
    [LABEL.toHolders]: "The holders share of a coin's tax, paid to the coin's holders as dividends.",
    [LABEL.toBuybacks]: "The buyback share of a coin's tax, used to buy back and burn the coin.",
    [LABEL.toLiquidity]: "The liquidity share of a coin's tax, added to the coin's pool and locked there for good.",
    [LABEL.snipeToBuybacks]: "The 80% of anti-snipe extras left after the platform share, used to buy back and burn the coin.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-10-30",
  methodology,
  breakdownMethodology,
};

export default adapter;
