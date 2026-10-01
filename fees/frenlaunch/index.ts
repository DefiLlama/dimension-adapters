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
import { METRIC } from "../../helpers/metrics";
import { getTransactions } from "../../helpers/getTxReceipts";
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
// Topics, not ABIs: the Doppler rail filters on indexed addresses. Transfer(address,address,uint256)
// and the Rehype module's Release(bytes32,address,uint256,uint256).

// The Doppler rail's split of the whole swap fee (fixed in frenlaunch's pool configuration), in
// thousandths of the integrator's 10% payout: the gross fee is 10× the payout,
// so creator 60% = 6000, referrer 10% = 1000, liquidity 11.32% = 1132, Doppler 8.68% = 868.
const DOPPLER_SPLIT = { creator: 6000n, referrer: 1000n, liquidity: 1132n, doppler: 868n };
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RELEASE_TOPIC = "0x951cb665214ddfa483febb22b592b0c67f38eac40f7be33f6fcbbe63289276d1";
// The Rehype module's IntegratorSet(bytes32 indexed poolId, address indexed old, address indexed new)
// and the v4 PoolManager's Swap (poolId indexed), which ties each payout to its pool.
const INTEGRATOR_SET_TOPIC = "0x3206bab1589699b18a3896cde833d2558d37b6def086f4368ff5f26e7a92cff2";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
// FeeBeneficiariesSet(bytes32 indexed poolId, (address beneficiary, uint96 shares)[] beneficiaries):
// the pool's beneficiary list at creation. UpdateBeneficiary moves one seat's shares; nothing is
// indexed (the platform's claimer can, via transferSlot).
const FEE_BENEFICIARIES_SET = "event FeeBeneficiariesSet(bytes32 indexed poolId, (address beneficiary, uint96 shares)[] beneficiaries)";
const UPDATE_BENEFICIARY = "event UpdateBeneficiary(bytes32 poolId, address oldBeneficiary, address newBeneficiary)";
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

  // Launch fees: launches in the window, each paying the factory's fee. Both rails pay it: curve
  // launches (TokenLaunched) and pool launches (PoolLaunched, a pool from block one whose trades
  // are the hook fees below; a factory without the rail emits none). launch() requires
  // msg.value == launchFee, so a launch sent straight to the factory paid exactly its
  // transaction's value, with no historical state needed (Robinhood Chain's RPCs keep only a few
  // thousand blocks of it). A launch sent through another contract reads launchFee at its own
  // block; if no RPC has that state, or the transaction cannot be fetched, the window fails and
  // is retried rather than guessed.
  const [tokenLaunches, poolLaunches] = await Promise.all([
    options.getLogs({ target: d.factory, eventAbi: TOKEN_LAUNCHED, entireLog: true, parseLog: true }),
    options.getLogs({ target: d.factory, eventAbi: POOL_LAUNCHED, entireLog: true, parseLog: true }),
  ]);
  const factoryLogs = [...tokenLaunches, ...poolLaunches];
  if (factoryLogs.length) {
    const txs = await getTransactions(options.chain, factoryLogs.map((l: any) => l.transactionHash));
    for (let i = 0; i < factoryLogs.length; i++) {
      const tx = txs[i], log = factoryLogs[i];
      if (!tx) throw new Error(`frenlaunch: launch transaction ${log.transactionHash} not found`);
      const fee = tx.to?.toLowerCase() === d.factory.toLowerCase()
        ? BigInt(tx.value)
        : BigInt(await sdk.api2.abi.call({ chain: options.chain, target: d.factory, abi: LAUNCH_FEE, block: Number(log.blockNumber) }));
      dailyFees.addGasToken(fee, L.LAUNCH);
      dailyRevenue.addGasToken(fee, L.LAUNCH_P);
    }
  }

  // Curve trades, in the native asset. The targets are this factory's curves, from TokenLaunched
  // since the chain's deployment block (cached, so Arc is not asked to replay pruned history on
  // every hourly run).
  const curves = [...new Set((await options.getLogs({
    target: d.factory, eventAbi: TOKEN_LAUNCHED, fromBlock: d.fromBlock, cacheInCloud: true,
  })).map((l: any) => String(l.curve).toLowerCase()))];
  const [buys, sells, curveFees] = curves.length ? await Promise.all([
    options.getLogs({ targets: curves, eventAbi: BUY, parseLog: true }),
    options.getLogs({ targets: curves, eventAbi: SELL, parseLog: true }),
    options.getLogs({ targets: curves, eventAbi: CURVE_FEES, parseLog: true }),
  ]) : [[], [], []];
  for (const log of buys) dailyVolume.addGasToken(BigInt(log.ethIn));
  for (const log of sells) dailyVolume.addGasToken(BigInt(log.ethOut) + BigInt(log.fee));
  for (const log of curveFees) {
    const creatorCut = BigInt(log.creatorCut), platformCut = BigInt(log.platformCut);
    dailyFees.addGasToken(creatorCut + platformCut, L.CURVE);
    dailyRevenue.addGasToken(platformCut, L.CURVE_P);
    dailySupplySideRevenue.addGasToken(creatorCut, L.CURVE_C);
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
    // Our pools (the Safe is their integrator), and who holds each pool's referrer seat: the
    // platform when a launch names no referrer, in which case that seat's 10% is protocol revenue,
    // not supply side. The seat starts with the holder in the pool's beneficiary list and follows
    // every UpdateBeneficiary that moves it, replayed in chain order up to each payout.
    const pools: string[] = (await options.getLogs({ target: module, topics: [INTEGRATOR_SET_TOPIC, null as any, null as any, pad(safe)], fromBlock: d.fromBlock, entireLog: true, cacheInCloud: true }))
      .map((l: any) => l.topics[1].toLowerCase());
    const ours = new Set(pools);
    const order = (l: any) => Number(l.blockNumber) * 1e6 + Number(l.logIndex);
    const seatHolder = new Map<string, string>();                       // at pool creation
    const seatMoves = new Map<string, { at: number; from: string; to: string }[]>();
    if (pools.length) {
      // extraTopics is the pool id (topic1). Passing it as topics would replace the event signature.
      const beneficiaryLogs = await options.getLogs({ target: module, eventAbi: FEE_BENEFICIARIES_SET, ...{ extraTopics: [pools] }, fromBlock: d.fromBlock, entireLog: true, parseLog: true, cacheInCloud: true });
      for (const l of beneficiaryLogs) {
        for (const row of l.args.beneficiaries)
          if (BigInt(row.shares) === REFERRER_SEAT_SHARES) seatHolder.set(String(l.args.poolId).toLowerCase(), String(row.beneficiary).toLowerCase());
      }
      const moves = await options.getLogs({ target: module, eventAbi: UPDATE_BENEFICIARY, fromBlock: d.fromBlock, entireLog: true, parseLog: true, cacheInCloud: true });
      for (const l of [...moves].sort((a: any, b: any) => order(a) - order(b))) {
        const id = String(l.args.poolId).toLowerCase();
        if (!ours.has(id)) continue;
        if (!seatMoves.has(id)) seatMoves.set(id, []);
        seatMoves.get(id)!.push({ at: order(l), from: String(l.args.oldBeneficiary).toLowerCase(), to: String(l.args.newBeneficiary).toLowerCase() });
      }
    }
    const platformHoldsSeat = (pool: string | undefined, log: any) => {
      if (!pool) return false;
      let holder = seatHolder.get(pool);
      for (const m of seatMoves.get(pool) ?? []) if (m.at < order(log) && m.from === holder) holder = m.to;
      return holder !== undefined && platform.has(holder);
    };
    // Each payout happens inside a swap: the PoolManager's Swap just before it in the same
    // transaction names the pool. A payout with no such swap keeps the referrer share on the
    // supply side, the conservative reading of revenue.
    const swaps = pools.length ? await options.getLogs({ target: poolManager, topics: [SWAP_TOPIC, pools as any], entireLog: true }) : [];
    const swapsByTx = new Map<string, any[]>();
    for (const s of swaps) {
      const tx = s.transactionHash.toLowerCase();
      if (!swapsByTx.has(tx)) swapsByTx.set(tx, []);
      swapsByTx.get(tx)!.push(s);
    }
    const poolOf = (log: any) => {
      let best: any;
      for (const s of swapsByTx.get(log.transactionHash.toLowerCase()) ?? []) if (Number(s.logIndex) < Number(log.logIndex) && (!best || Number(s.logIndex) > Number(best.logIndex))) best = s;
      return best?.topics[1].toLowerCase();
    };
    // A collect that releases a beneficiary seat held by the Safe itself also moves module -> Safe;
    // those transactions are not the integrator's and are left out (the seat is counted at trade time;
    // every platform seat is the fee claimer's since 2026-09-14).
    const seatTxs = new Set((await options.getLogs({ target: module, topics: [RELEASE_TOPIC, null as any, pad(safe)], entireLog: true }))
      .map((l: any) => l.transactionHash.toLowerCase()));
    // Emitted by the fee token (WETH on sells, the launched token on buys), so there is no contract list to pass as targets.
    const payouts = await options.getLogs({ noTarget: true, topics: [TRANSFER_TOPIC, pad(module), pad(safe)], entireLog: true });
    for (const log of payouts) {
      if (seatTxs.has(log.transactionHash.toLowerCase())) continue;
      const token = log.address, paid = BigInt(log.data);
      dailyFees.add(token, paid * 10n, L.DOPPLER);
      dailyRevenue.add(token, paid, L.DOPPLER_P);
      const share = (k: keyof typeof DOPPLER_SPLIT) => (paid * DOPPLER_SPLIT[k]) / 1000n;
      dailySupplySideRevenue.add(token, share("creator"), L.DOPPLER_C);
      if (platformHoldsSeat(poolOf(log), log)) dailyRevenue.add(token, share("referrer"), L.DOPPLER_RP);
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
  ProtocolRevenue: "All launch fees and the platform's 25% of curve and graduated-pool trading fees, the platform's 10% integrator share of Doppler pool swap fees, and the 10% referrer seat on Doppler pools launched without a referrer (the platform holds that seat).",
  SupplySideRevenue: "Curve and graduated pools: the creator's 75% of trading fees. Doppler pools: creator 60%, creator's referrer 10% (when the launch has one), re-invested liquidity 11.32%, Doppler 8.68% of the swap fee.",
};
const breakdownMethodology = {
  Fees: { [L.LAUNCH]: "The factory's launch fee, charged once per token launched.", [L.CURVE]: "1% of every buy and sell on a bonding curve.", [L.POOL]: "1% of every swap in a graduated pool, taken by the fee hook in the input currency.", [L.DOPPLER]: "The Rehype swap fee on frenlaunch's Doppler pools (1%, higher in a launch's first minutes), ten times the integrator payout." },
  Revenue: { [L.LAUNCH_P]: "All launch fees.", [L.CURVE_P]: "The platform's cut in each curve FeesAccrued event.", [L.POOL_P]: "The platform's cut in each hook FeeAccrued event.", [L.DOPPLER_P]: "The 10% integrator share the Rehype module pays the platform Safe on every trade.", [L.DOPPLER_RP]: "The 10% referrer seat of Doppler pools launched without a referrer, while the platform holds it (each pool's beneficiary list, followed through every UpdateBeneficiary)." },
  SupplySideRevenue: { [L.CURVE_C]: "The creator's cut in each curve FeesAccrued event.", [L.POOL_C]: "The creator's cut in each hook FeeAccrued event.", [L.DOPPLER_C]: "The creator's 60% of the Doppler pool fee.", [L.DOPPLER_R]: "The 10% seat of the creator's referrer, on pools launched with one.", [L.DOPPLER_LP]: "11.32% of the fee re-invested as pool liquidity by the Rehype module.", [L.DOPPLER_D]: "Doppler's 8.68% (its 5% protocol cut plus its 5% beneficiary seat)." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: deployments,
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
