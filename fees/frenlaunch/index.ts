// DefiLlama dimension-adapter for frenlaunch (fees/frenlaunch/index.ts in DefiLlama/dimension-adapters).
// Curve rail: a bonding curve per token that graduates into a Uniswap v4 pool behind our fee hook.
// Everything is read from event logs; the fee split is taken from the contracts' own accrual
// events, not assumed.
//
// Doppler rail (Robinhood Chain): a Doppler/Rehype pool from block one, frenlaunch the Rehype
// integrator. The module pays the integrator share (10% of the gross fee, fixed per pool) to the
// platform Safe inside every trade, with no event of its own: those transfers are the rail's
// revenue, and the gross fee is ten times them.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import { Interface } from "ethers";
import { METRIC } from "../../helpers/metrics";
const deployments: Record<string, { factory: string; hook: string; fromBlock: number; start: string; doppler?: { module: string; safe: string; claimer: string; poolManager: string } }> = {
  "robinhood": {
    "factory": "0x2c40C69d5E1AA1D0d7Ee20De7d439BF683804F8B",
    "hook": "0xD4ECfA747B1FB2C9195dBa71A3F8033Cf70E6088",
    "fromBlock": 49600000,
    "start": "2026-08-30",
    "doppler": {
      "module": "0xe2AEbc987592593b667ec29178D0A83929Db78b6",
      "safe": "0x0dB4b112Efdb79Ab566Dd4D9c44E950AEd89B08e",
      "claimer": "0xb1721068CF4a0ECd41f41701d6EA59546c3843e2",
      "poolManager": "0x8366a39CC670B4001A1121B8F6A443A643e40951"
    }
  },
  "arc": {
    "factory": "0xA3c7Cae6f64785f54E11f984bAdb35f2f4E08ea9",
    "hook": "0x752F2CA887D1d12D4944CB025D6ca4a268bAa088",
    "fromBlock": 21687000,
    "start": "2026-09-19"
  }
};

const TOKEN_LAUNCHED = "event TokenLaunched(address indexed token, address indexed curve, address indexed creator, bytes32 salt, string name, string symbol, uint256 totalSupply)";
const POOL_LAUNCHED = "event PoolLaunched(address indexed token, address indexed pool, address indexed creator, bytes32 salt, string name, string symbol, uint256 totalSupply, bytes32 poolId)";
const BUY = "event Buy(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee)";            // ethIn is gross of the fee
const SELL = "event Sell(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 fee)";          // ethOut is net of the fee
const CURVE_FEES = "event FeesAccrued(address indexed creator, uint256 creatorCut, address indexed platform, uint256 platformCut)";
const HOOK_FEES = "event FeeAccrued(bytes32 indexed poolId, address indexed creator, uint256 creatorCut, uint256 platformCut, address indexed currencyIn)";
const LAUNCH_FEE = "function launchFee() view returns (uint256)";
const IS_OFFICIAL_CURVE = "function isOfficialCurve(address curve) view returns (bool)";
// Topics, not ABIs: the Doppler rail filters on indexed addresses. Transfer(address,address,uint256)
// and the Rehype module's Release(bytes32,address,uint256,uint256).

// The Doppler rail's split of the whole swap fee (fixed in frenlaunch's pool configuration), in
// thousandths of the integrator's 10% payout: the gross fee is 10× the payout,
// so creator 60% = 6000, referrer 10% = 1000, liquidity 11.32% = 1132, Doppler 8.68% = 868.
const DOPPLER_SPLIT = { creator: 6000n, referrer: 1000n, liquidity: 1132n, doppler: 868n };
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RELEASE_TOPIC = "0x951cb665214ddfa483febb22b592b0c67f38eac40f7be33f6fcbbe63289276d1";
// The Rehype module's IntegratorSet(bytes32 indexed poolId, address indexed old, address indexed new),
// its per-pool beneficiary list (poolId indexed; data: (address beneficiary, uint96 shares)[]), and
// the v4 PoolManager's Swap (poolId indexed), which ties each payout to its pool.
const INTEGRATOR_SET_TOPIC = "0x3206bab1589699b18a3896cde833d2558d37b6def086f4368ff5f26e7a92cff2";
const BENEFICIARIES_TOPIC = "0x0c90f8fcadd900399eb6c30bc91ec4531380b92bc2c4c364675528b1d30601e2";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
// The referrer seat's share of the beneficiary pot (9.5/70 of 1e18); its holder is the creator's
// referrer, or the platform (fee claimer or Safe) when a launch names none.
const REFERRER_SEAT_SHARES = 135714285714285714n;
const pad = (a: string) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");

const L = {
  LAUNCH: "Launch Fees", CURVE: "Curve Swap Fees", POOL: METRIC.SWAP_FEES,
  LAUNCH_P: "Launch Fees to Protocol", CURVE_P: "Curve Swap Fees to Protocol", POOL_P: "Pool Swap Fees to Protocol",
  CURVE_C: "Curve Swap Fees to Creators", POOL_C: "Pool Swap Fees to Creators",
  DOPPLER: "Doppler Pool Swap Fees", DOPPLER_P: "Doppler Pool Swap Fees to Protocol",
  DOPPLER_C: "Doppler Pool Swap Fees to Creators", DOPPLER_R: "Doppler Pool Swap Fees to Referrers",
  DOPPLER_LP: "Doppler Pool Swap Fees to Liquidity", DOPPLER_D: "Doppler Pool Swap Fees to Doppler",
  DOPPLER_RP: "Doppler Pool Swap Fees to Protocol (Referrer Seat)",
};

async function fetch(options: FetchOptions) {
  const d = (deployments as any)[options.chain];
  const dailyVolume = options.createBalances(), dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances(), dailySupplySideRevenue = options.createBalances();

  // One log query per source and window (Arc's public RPCs rate-limit hard): the factory's
  // launches, and every Buy/Sell/FeesAccrued on the chain, kept only when the emitter is one of
  // the factory's curves (LaunchFactory.isOfficialCurve, read at the head: a curve stays
  // official). Asking the factory beats replaying every TokenLaunched since deploy, which pruned
  // RPCs refuse ("pruned history unavailable" on Arc).
  const iface = new Interface([TOKEN_LAUNCHED, POOL_LAUNCHED, BUY, SELL, CURVE_FEES]);
  const topic = (name: string) => iface.getEvent(name)!.topicHash;

  // Launch fees: launches in the window × the factory's fee. Both rails pay it: curve launches
  // (TokenLaunched) and pool launches (PoolLaunched, a pool from block one whose trades are the
  // hook fees below; a factory without the rail emits none). The fee is read at the head, not at
  // the window's block: Robinhood Chain's RPCs keep a few thousand blocks of state ("historical
  // state … is not available" past that), and it is a timelocked setting that has not changed
  // since launch. No launches, no call.
  const factoryLogs = await options.getLogs({ target: d.factory, topics: [[topic("TokenLaunched"), topic("PoolLaunched")] as any], entireLog: true });
  const launches = BigInt(factoryLogs.length);
  const launchFee = launches ? BigInt(await sdk.api2.abi.call({ chain: options.chain, target: d.factory, abi: LAUNCH_FEE })) : 0n;
  dailyFees.addGasToken(launchFee * launches, L.LAUNCH);
  dailyRevenue.addGasToken(launchFee * launches, L.LAUNCH_P);

  // Curve trades, in the native asset.
  const curveLogs = await options.getLogs({ noTarget: true, topics: [[topic("Buy"), topic("Sell"), topic("FeesAccrued")] as any], entireLog: true });
  const emitters = [...new Set<string>(curveLogs.map((l: any) => l.address.toLowerCase()))];
  const official = emitters.length
    ? await sdk.api2.abi.multiCall({ chain: options.chain, target: d.factory, abi: IS_OFFICIAL_CURVE, calls: emitters.map((a) => ({ params: [a] })), permitFailure: true })
    : [];
  const curves = new Set(emitters.filter((_, i) => official[i] === true));
  for (const log of curveLogs) {
    if (!curves.has(log.address.toLowerCase())) continue;
    const e = iface.parseLog({ topics: log.topics, data: log.data })!;
    if (e.name === "Buy") dailyVolume.addGasToken(BigInt(e.args.ethIn));
    if (e.name === "Sell") dailyVolume.addGasToken(BigInt(e.args.ethOut) + BigInt(e.args.fee));
    if (e.name === "FeesAccrued") {
      const creatorCut = BigInt(e.args.creatorCut), platformCut = BigInt(e.args.platformCut);
      dailyFees.addGasToken(creatorCut + platformCut, L.CURVE);
      dailyRevenue.addGasToken(platformCut, L.CURVE_P);
      dailySupplySideRevenue.addGasToken(creatorCut, L.CURVE_C);
    }
  }

  // Graduated pools: the hook takes the fee in the swap's input currency (the native asset on
  // buys, the token on sells) and records the split. Volume of graduated pools is Uniswap v4's.
  for (const log of await options.getLogs({ target: d.hook, eventAbi: HOOK_FEES })) {
    const creatorCut = BigInt(log.creatorCut), platformCut = BigInt(log.platformCut);
    dailyFees.add(log.currencyIn, creatorCut + platformCut, L.POOL);
    dailyRevenue.add(log.currencyIn, platformCut, L.POOL_P);
    dailySupplySideRevenue.add(log.currencyIn, creatorCut, L.POOL_C);
  }

  // Doppler rail: the integrator payouts, module -> Safe, in whichever pool currency the fee was
  // taken in (WETH on sells, the launched token on buys).
  if (d.doppler) {
    const { module, safe, claimer, poolManager } = d.doppler;
    const platform = new Set([safe.toLowerCase(), claimer.toLowerCase()]);
    // Our pools (the Safe is their integrator), and those whose referrer seat the platform holds
    // (launches with no referrer): that seat's 10% is protocol revenue, not supply side.
    const pools: string[] = (await options.getLogs({ target: module, topics: [INTEGRATOR_SET_TOPIC, null as any, null as any, pad(safe)], fromBlock: d.fromBlock, entireLog: true, cacheInCloud: true }))
      .map((l: any) => l.topics[1].toLowerCase());
    const platformSeat = new Set<string>();
    if (pools.length) {
      for (const l of await options.getLogs({ target: module, topics: [BENEFICIARIES_TOPIC, pools as any], fromBlock: d.fromBlock, entireLog: true, cacheInCloud: true })) {
        const words = (l.data.slice(2).match(/.{64}/g) || []) as string[];
        const n = Number(BigInt("0x" + words[1]));
        for (let i = 0; i < n; i++) {
          const holder = "0x" + words[2 + 2 * i].slice(24), shares = BigInt("0x" + words[3 + 2 * i]);
          if (shares === REFERRER_SEAT_SHARES && platform.has(holder.toLowerCase())) platformSeat.add(l.topics[1].toLowerCase());
        }
      }
    }
    // Each payout happens inside a swap: the PoolManager's Swap just before it in the same
    // transaction names the pool.
    const swaps = pools.length ? await options.getLogs({ target: poolManager, topics: [SWAP_TOPIC, pools as any], entireLog: true }) : [];
    const poolOf = (log: any) => {
      let best: any;
      for (const s of swaps) if (s.transactionHash.toLowerCase() === log.transactionHash.toLowerCase() && Number(s.logIndex) < Number(log.logIndex) && (!best || Number(s.logIndex) > Number(best.logIndex))) best = s;
      return best?.topics[1].toLowerCase();
    };
    // A collect that releases a beneficiary seat held by the Safe itself also moves module -> Safe;
    // those transactions are not the integrator's and are left out (the seat is counted at trade time;
    // every platform seat is the fee claimer's since 2026-09-14).
    const seatTxs = new Set((await options.getLogs({ target: module, topics: [RELEASE_TOPIC, null as any, pad(safe)], entireLog: true }))
      .map((l: any) => l.transactionHash.toLowerCase()));
    const payouts = await options.getLogs({ noTarget: true, topics: [TRANSFER_TOPIC, pad(module), pad(safe)], entireLog: true });
    for (const log of payouts) {
      if (seatTxs.has(log.transactionHash.toLowerCase())) continue;
      const token = log.address, paid = BigInt(log.data);
      dailyFees.add(token, paid * 10n, L.DOPPLER);
      dailyRevenue.add(token, paid, L.DOPPLER_P);
      const share = (k: keyof typeof DOPPLER_SPLIT) => (paid * DOPPLER_SPLIT[k]) / 1000n;
      dailySupplySideRevenue.add(token, share("creator"), L.DOPPLER_C);
      if (platformSeat.has(poolOf(log))) dailyRevenue.add(token, share("referrer"), L.DOPPLER_RP);
      else dailySupplySideRevenue.add(token, share("referrer"), L.DOPPLER_R);
      dailySupplySideRevenue.add(token, share("liquidity"), L.DOPPLER_LP);
      dailySupplySideRevenue.add(token, share("doppler"), L.DOPPLER_D);
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
  Volume: "Trades on frenlaunch bonding curves. Swaps in Uniswap v4 pools (graduated curve pools and Doppler pools) are excluded (they are Uniswap v4 volume).",
  Fees: "Launch fees, the 1% fee on curve trades, the 1% hook fee on swaps in graduated pools (all from the contracts' fee-accrual events), and the swap fee on frenlaunch's Doppler pools (ten times the platform's 10% integrator payout).",
  Revenue: "All launch fees, the platform's 25% of curve and graduated-pool trading fees, the platform's 10% integrator share of Doppler pool swap fees, and the 10% referrer seat on Doppler pools launched without a referrer (the platform holds that seat).",
  ProtocolRevenue: "Same as revenue: there is no token and no holder distribution.",
  SupplySideRevenue: "Curve and graduated pools: the creator's 75% of trading fees. Doppler pools: creator 60%, creator's referrer 10% (when the launch has one), re-invested liquidity 11.32%, Doppler 8.68% of the swap fee.",
};
const breakdownMethodology = {
  Fees: { [L.LAUNCH]: "The factory's launch fee, charged once per token launched.", [L.CURVE]: "1% of every buy and sell on a bonding curve.", [L.POOL]: "1% of every swap in a graduated pool, taken by the fee hook in the input currency.", [L.DOPPLER]: "The Rehype swap fee on frenlaunch's Doppler pools (1%, higher in a launch's first minutes), ten times the integrator payout." },
  Revenue: { [L.LAUNCH_P]: "All launch fees.", [L.CURVE_P]: "The platform's cut in each curve FeesAccrued event.", [L.POOL_P]: "The platform's cut in each hook FeeAccrued event.", [L.DOPPLER_P]: "The 10% integrator share the Rehype module pays the platform Safe on every trade.", [L.DOPPLER_RP]: "The 10% referrer seat of Doppler pools launched without a referrer, which the platform holds (read from each pool's beneficiary list)." },
  SupplySideRevenue: { [L.CURVE_C]: "The creator's cut in each curve FeesAccrued event.", [L.POOL_C]: "The creator's cut in each hook FeeAccrued event.", [L.DOPPLER_C]: "The creator's 60% of the Doppler pool fee.", [L.DOPPLER_R]: "The 10% seat of the creator's referrer, on pools launched with one.", [L.DOPPLER_LP]: "11.32% of the fee re-invested as pool liquidity by the Rehype module.", [L.DOPPLER_D]: "Doppler's 8.68% (its 5% protocol cut plus its 5% beneficiary seat)." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(Object.entries(deployments).map(([chain, d]: any) => [chain, { fetch, start: d.start }])),
  methodology,
  breakdownMethodology,
};

export default adapter;
