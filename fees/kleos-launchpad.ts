import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// Kleos launchpad (https://thekleos.pro, https://x.com/TheKleos_) on Elysium: buy / sell taxes on its taxed coins, read from
// each tax hook's Taxed events and split per coin by taxOf. Fees only: there is no bonding curve. KleosSwap is dexs/kleos-swap.
// Sources: https://github.com/aidaonsui-collab/flux (app/src/config/deployments/99901.json)

const TAX_HOOKS: { hook: string; kind: "v4" | "pair" | "v5" }[] = [
  { hook: "0x0c835e6A51717a514144d95c7F0a1C640179E0Cc", kind: "v4" }, // KleosTaxHook
  { hook: "0x772AccB053609D361593345e361D2a6854Ede8cc", kind: "pair" }, // KleosPairHook ($KLEOS-paired)
  { hook: "0xD5068e7f4e2D70d5eFbaC6fD28A8407252E1EAcC", kind: "v5" }, // KleosV5Hook
  { hook: "0x0fa71294c909b11A0b805df4763Ba576c69c2acC", kind: "v5" }, // KleosV5Hook
  { hook: "0x1fe9C91651d42a74048dCfcfa63175F8A12eeAcC", kind: "v5" }, // KleosV5Hook
];
const KLEOS = "0x51c343ed5131f17895991849860b61c2cb0e7e7a"; // $KLEOS

const LABEL = {
  swapTaxes: "Swap Taxes",
  toPlatform: "Fees To Platform",
  platformBurned: "Platform Cut Burned ($KLEOS)",
  toCreators: "Fees To Creators",
  toHolders: "Fees To Coin Holders",
  toCoinBuyback: "Fees To Coin Buyback And Burn",
};

const TAXED = "event Taxed(address indexed token, bool buy, uint256 tax)";
const TAX_OF = "function taxOf(address token) view returns ((address token, address creator, uint16 buyBps, uint16 sellBps, uint16 platformBps, uint16 creatorBps, uint16 holdersBps, uint16 buybackBps))";
const POOL_KEY_OF = "function poolKeyOf(address token) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))";
const PLAN_OF = "function planOf(address token) view returns ((address quote, bool burnsPlatformCut, uint256 buybackMin, (address token, uint16 bps, address pool, uint32 twapWindow, uint16 maxTickDeviation, uint256 minBatch)[2] rewards))";
const BURNS_PLATFORM_CUT = "function burnsPlatformCut() view returns (bool)";

const BPS = 10_000n;
const lower = (a: string) => String(a).toLowerCase();

// Elysium getLogs can return the same log twice when it splits a range
const dedupeLogs = (logs: any[]) => {
  const seen = new Set<string>();
  return logs.filter((log) => {
    const key = `${lower(log.transactionHash)}-${Number(log.logIndex)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const addAsset = (balances: Balances, asset: string, amount: bigint, label: string) => {
  if (amount === 0n) return;
  if (asset === ADDRESSES.null) balances.addGasToken(amount, label);
  else balances.add(asset, amount, label);
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const kindOf: Record<string, string> = {};
  TAX_HOOKS.forEach(({ hook, kind }) => (kindOf[lower(hook)] = kind));
  const taxed = dedupeLogs(await options.getLogs({ targets: Object.keys(kindOf), eventAbi: TAXED, onlyArgs: false }));
  const keyOf = (hook: string, token: string) => `${lower(hook)}|${lower(token)}`;
  const coins = [...new Map(taxed.map((l: any) => [keyOf(l.address, l.args.token), { hook: lower(l.address), token: lower(l.args.token) }])).values()];
  const calls = coins.map((c) => ({ target: c.hook, params: [c.token] }));
  const taxes = await options.api.multiCall({ abi: TAX_OF, calls });
  const keys = await options.api.multiCall({ abi: POOL_KEY_OF, calls });
  // Platform cut burned or kept: per coin via planOf on v5 (older plans fall back to quote == $KLEOS), per hook on pair, never on v4
  const v5 = coins.flatMap((c, i) => (kindOf[c.hook] === "v5" ? [i] : []));
  const plans = await options.api.multiCall({ abi: PLAN_OF, calls: v5.map((i) => calls[i]), permitFailure: true });
  // only pair hooks with taxes in the window, so the hook exists at this block
  const pairHooks = [...new Set(coins.filter((c) => kindOf[c.hook] === "pair").map((c) => c.hook))];
  const pairBurns = await options.api.multiCall({ abi: BURNS_PLATFORM_CUT, calls: pairHooks });

  const info: Record<string, { quote: string; tax: any; burns: boolean }> = {};
  coins.forEach((c, i) => {
    const quote = lower(lower(keys[i].currency1) === c.token ? keys[i].currency0 : keys[i].currency1);
    let burns = false;
    if (kindOf[c.hook] === "pair") burns = !!pairBurns[pairHooks.indexOf(c.hook)];
    if (kindOf[c.hook] === "v5") {
      const plan = plans[v5.indexOf(i)];
      burns = plan ? !!plan.burnsPlatformCut : quote === KLEOS;
    }
    info[keyOf(c.hook, c.token)] = { quote, tax: taxes[i], burns };
  });

  for (const log of taxed) {
    const { quote, tax: t, burns } = info[keyOf(log.address, log.args.token)];
    const tax = BigInt(log.args.tax);
    const toPlatform = (tax * BigInt(t.platformBps)) / BPS;
    const rest = tax - toPlatform;
    const toHolders = (rest * BigInt(t.holdersBps)) / BPS;
    const toBuyback = (rest * BigInt(t.buybackBps)) / BPS;
    addAsset(dailyFees, quote, tax, LABEL.swapTaxes);
    if (burns) {
      addAsset(dailyRevenue, quote, toPlatform, LABEL.platformBurned);
      addAsset(dailyHoldersRevenue, quote, toPlatform, LABEL.platformBurned);
    } else {
      addAsset(dailyRevenue, quote, toPlatform, LABEL.toPlatform);
      addAsset(dailyProtocolRevenue, quote, toPlatform, LABEL.toPlatform);
    }
    addAsset(dailySupplySideRevenue, quote, rest - toHolders - toBuyback, LABEL.toCreators);
    addAsset(dailySupplySideRevenue, quote, toHolders, LABEL.toHolders);
    addAsset(dailySupplySideRevenue, quote, toBuyback, LABEL.toCoinBuyback);
  }

  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: "The buy / sell tax each coin's creator set (1-10%), paid in the pool's pair asset on every trade of a coin launched on Kleos with a tax. Classic coins' trading fees are in KleosSwap's listing.",
  UserFees: "The buy / sell taxes traders pay on coins launched on Kleos with a tax.",
  Revenue: "The platform's cut of every tax: kept by the platform, or burned for a pair asset whose platform cut burns, such as $KLEOS.",
  ProtocolRevenue: "The platform's cut of taxes, kept by the platform.",
  HoldersRevenue: "The platform's cut of taxes on $KLEOS-paired coins, which is burned.",
  SupplySideRevenue: "The rest of each tax: to the coin's creator, its holders (rewards) and its buyback & burn.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.swapTaxes]: "Buy / sell tax on taxed coins, from the hooks' Taxed events.",
  },
  UserFees: {
    [LABEL.swapTaxes]: "Buy / sell tax paid by traders.",
  },
  Revenue: {
    [LABEL.toPlatform]: "The platform's share of taxes (platformBps, stamped per coin), kept.",
    [LABEL.platformBurned]: "The platform's share of taxes on $KLEOS-paired coins, burned.",
  },
  ProtocolRevenue: {
    [LABEL.toPlatform]: "The platform's share of taxes, kept by the platform.",
  },
  HoldersRevenue: {
    [LABEL.platformBurned]: "The platform's share of taxes on $KLEOS-paired coins, burned.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "The coin creator's share.",
    [LABEL.toHolders]: "Rewards to the coin's holders.",
    [LABEL.toCoinBuyback]: "Set aside to buy back and burn the coin.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-10-28",
  methodology,
  breakdownMethodology,
};

export default adapter;
