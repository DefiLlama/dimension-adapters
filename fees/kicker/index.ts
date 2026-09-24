import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

/**
 * Kicker: redeemable floor pots on Robinhood Chain.
 *
 * A pot is a vault with erc-20 shares (K) holding one core asset (native ETH or a tokenized stock such as GLD/NVDA).
 * Coins are launched through the pot on Pons
 * and the creator tax of every launched coin is collected onto the pot's floor. Pot shares redeem pro rata.
 *
 * Fee sources, all denominated in the pot's core asset:
 * 1. Creator tax collected from launched coins onto the floor (Collect.coreIn): it raises NAV per share of the pot's
 *    depositors (K is a redeemable vault share, not a governance token), so it is supply side.
 * 2. With launch terms (v0.5+), the tax is first split (TaxSplit.Split): a launcher share, a buyback share that
 *    buys and burns the launched coin (both supply side), a 10% platform share, and the rest onto the floor (already in Collect).
 * 3. A 0.5% fee on every pot deposit (Fees: creator / referrer = supply side, platform = protocol).
 * The platform shares are received by KickerBuyer and are protocol revenue. KickerBuyer later spends them on KICKER
 * buybacks; that spend is not counted again.
 * Pons is listed separately; the launchpad's own fees are not counted here.
 */

const CREATED = "event Created(address indexed kicker, address indexed creator, address indexed core, string symbol)";
const COLLECT = "event Collect(address indexed caller, uint256 coreIn)";
const FEES = "event Fees(address indexed creator, address indexed ref, address indexed platform, uint256 c, uint256 r, uint256 p)";
const LAUNCH_TERMS_V5 = "event LaunchTerms(address indexed token, address indexed launcher, address split, uint16 creatorBps, uint16 burnBps)";
const LAUNCH_TERMS_V6 = "event LaunchTerms(address indexed token, address indexed launcher, address split, uint16 creatorBps, uint16 burnBps, address burnTarget)";
const SPLIT = "event Split(uint256 total, uint256 toLauncher, uint256 toPlatform, uint256 toBurn, uint256 toPot)";

const NULL = ADDRESSES.null;
const LABEL = { DEPOSIT: "Deposit Fees", TERMS: "Launch Terms Platform Share", LAUNCHER: "Launcher Share Of Creator Tax", BURN: "Launched Coin Buyback And Burn" };

const FACTORIES: { target: string; fromBlock: number }[] = [
    { target: "0x8cedef3db74173bf392cf5e8bafbee6d826fb29b", fromBlock: 61964437 },
    { target: "0x1Cd9e237D19e33a4D12048aa215D8dA06e460641", fromBlock: 62011400 },
    { target: "0xd4CD0618C38Eeff73AE16Cd0c89dD3A79b125603", fromBlock: 62035000 },
    { target: "0x45f20ef40702ef67ecd96180e4b4ea1c368002a7", fromBlock: 62355500 },
    { target: "0x989934128eac33515177cb5a5cc04d8e0467e03e", fromBlock: 62396000 },
    { target: "0x3b38da83fba6e49befa528cd8604fc1023417e29", fromBlock: 62745000 },
    { target: "0x63aa792f2c5a350ce418dccbbc7611c8765826ee", fromBlock: 62746800 },
    { target: "0x9a140c3f2a0b56D6e728AcF5cF7dA310DB7f4491", fromBlock: 63860480 },
    { target: "0x3dAC912C8B1FE43D7a5B6750D7aa5a3C05405Bf4", fromBlock: 65202900 },
    { target: "0x21f98C9bA8C3d357A6E2b7FFAFe80B2eAb0344aC", fromBlock: 65221294 },
    { target: "0x29e6f734eB9410B4c50aeCEEE753a0AC7bd2FeDE", fromBlock: 65382339 },
    { target: "0xA37eA52652D6A5976F9e1BbF33C111176cd0c013", fromBlock: 65643553 },
];

async function pots(options: FetchOptions): Promise<{ pot: string; core: string }[]> {
  const logs = await options.getLogs({
    targets: FACTORIES.map((f) => f.target),
    eventAbi: CREATED,
    fromBlock: Math.min(...FACTORIES.map((f) => f.fromBlock)),
    cacheInCloud: true,
  });
  return logs.map((l: any) => ({ pot: l.kicker, core: l.core }));
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const all = await pots(options);
  const coreOf: Record<string, string> = {};
  for (const p of all) coreOf[p.pot.toLowerCase()] = p.core;
  const targets = all.map((p) => p.pot);
  if (!targets.length) return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };

  const add = (b: ReturnType<FetchOptions["createBalances"]>, core: string, amt: any, label: string) =>
    core === NULL ? b.addGasToken(amt, label) : b.add(core, amt, label);

  // 1. creator tax that reached a floor: paid by swappers of launched coins, accrues to pot depositors
  const collects = await options.getLogs({ targets, eventAbi: COLLECT, flatten: false });
  collects.forEach((logs: any[], i: number) => {
    const core = coreOf[targets[i].toLowerCase()];
    for (const l of logs) {
      add(dailyFees, core, l.coreIn, METRIC.CREATOR_FEES);
      add(dailySupplySideRevenue, core, l.coreIn, METRIC.CREATOR_FEES);
    }
  });

  // 3. deposit fees
  const fees = await options.getLogs({ targets, eventAbi: FEES, flatten: false });
  fees.forEach((logs: any[], i: number) => {
    const core = coreOf[targets[i].toLowerCase()];
    for (const l of logs) {
      add(dailyFees, core, l.c, LABEL.DEPOSIT); add(dailyFees, core, l.r, LABEL.DEPOSIT); add(dailyFees, core, l.p, LABEL.DEPOSIT);
      add(dailySupplySideRevenue, core, l.c, LABEL.DEPOSIT); add(dailySupplySideRevenue, core, l.r, LABEL.DEPOSIT);
      add(dailyRevenue, core, l.p, LABEL.DEPOSIT); add(dailyProtocolRevenue, core, l.p, LABEL.DEPOSIT);
    }
  });

  // 2. launch terms: the parts of the tax that never reach the floor (the floor part is already counted in Collect)
  {
    const splits: { split: string; core: string }[] = [];
    for (const abi of [LAUNCH_TERMS_V5, LAUNCH_TERMS_V6]) {
      const terms = await options.getLogs({ targets, eventAbi: abi, flatten: false, fromBlock: 65202900, cacheInCloud: true });
      terms.forEach((logs: any[], i: number) => {
        const core = coreOf[targets[i].toLowerCase()];
        for (const l of logs) splits.push({ split: l.split, core });
      });
    }
    if (splits.length) {
      const splitLogs = await options.getLogs({ targets: splits.map((s) => s.split), eventAbi: SPLIT, flatten: false });
      splitLogs.forEach((logs: any[], i: number) => {
        const core = splits[i].core;
        for (const l of logs) {
          add(dailyFees, core, l.toLauncher, LABEL.LAUNCHER); add(dailyFees, core, l.toBurn, LABEL.BURN); add(dailyFees, core, l.toPlatform, LABEL.TERMS);
          add(dailySupplySideRevenue, core, l.toLauncher, LABEL.LAUNCHER); add(dailySupplySideRevenue, core, l.toBurn, LABEL.BURN);
          add(dailyRevenue, core, l.toPlatform, LABEL.TERMS); add(dailyProtocolRevenue, core, l.toPlatform, LABEL.TERMS);
        }
      });
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-09-13" },
  },
  pullHourly: true,
  methodology: {
    Fees: "Creator tax on swaps of coins launched through Kicker pots (floor, launcher, buyback and platform parts) plus the 0.5% fee on pot deposits, in the pot's core asset.",
    UserFees: "Same as Fees: every part is paid by users.",
    Revenue: "The platform shares: 10% of taxes on coins launched with terms and the platform part of deposit fees. Creator tax onto pot floors is not revenue.",
    ProtocolRevenue: "The platform shares, received by KickerBuyer. KickerBuyer later spends them on KICKER buybacks and burns; that spend is not counted again.",
    HoldersRevenue: "None. Pot shares (K) are redeemable vault shares, not a governance or value-accrual token.",
    SupplySideRevenue: "Creator tax collected onto pot floors (accrues to pot depositors), launcher and buyback shares of taxes on coins launched with terms, and pot creator / referrer parts of deposit fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.CREATOR_FEES]: "Creator tax on swaps of launched coins collected onto pot floors.",
      [LABEL.LAUNCHER]: "Launcher's share of the tax on coins launched with terms.",
      [LABEL.BURN]: "Share of the tax on coins launched with terms that buys and burns the launched coin.",
      [LABEL.TERMS]: "Platform's 10% of the tax on coins launched with terms.",
      [LABEL.DEPOSIT]: "0.5% fee on pot deposits (pot creator, referrer, platform).",
    },
    Revenue: {
      [LABEL.TERMS]: "Platform's 10% of the tax on coins launched with terms.",
      [LABEL.DEPOSIT]: "Platform part of the 0.5% deposit fee.",
    },
    ProtocolRevenue: {
      [LABEL.TERMS]: "Platform's 10% of the tax on coins launched with terms, received by KickerBuyer.",
      [LABEL.DEPOSIT]: "Platform part of the 0.5% deposit fee, received by KickerBuyer.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Creator tax collected onto pot floors, accruing to pot depositors.",
      [LABEL.LAUNCHER]: "Launcher's share of the tax on coins launched with terms.",
      [LABEL.BURN]: "Share of the tax on coins launched with terms that buys and burns the launched coin.",
      [LABEL.DEPOSIT]: "Pot creator and referrer parts of the 0.5% deposit fee.",
    },
  },
};

export default adapter;
