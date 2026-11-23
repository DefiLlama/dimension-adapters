import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ActiveMarket, getMarketWindow, PLATFORM_PRESET } from "./shared";

const ABI = {
  creatorFees: "uint256:creatorFees",
  platformFees: "uint256:platformFees",
  // only on the newer market implementation (the RUNUP token since its migration), see the permitFailure below
  holderFees: "uint256:holderFees",
  buybackFees: "uint256:buybackFees",
  treasuryFees: "uint256:treasuryFees",
  cumulativeLiquidityFees: "uint256:cumulativeLiquidityFees",
  tradeFeeBps: "uint16:tradeFeeBps",
  phase: "uint8:phase",
  feesCollected: "event FeesCollected(uint256 strategy, uint256 buyback, uint256 creator, uint256 platform)",
  holderFeesClaimed: "event HolderFeesClaimed(address indexed to, uint256 amount)",
};

const PENDING = ["creatorFees", "platformFees", "holderFees", "buybackFees", "treasuryFees", "cumulativeLiquidityFees"] as const;
type Pending = Record<(typeof PENDING)[number], bigint>;

const LABELS = {
  coinFees: "Coin Trading Fees",
  runnerFees: "RUNNER Trading Fees",
  platform: "Trading Fees To Platform",
  creators: "Trading Fees To Creators",
  liquidity: "Trading Fees To Pool Liquidity",
  strategy: "Trading Fees To Coin Strategy Treasuries",
  buybacks: "Trading Fees To Coin Buybacks",
  holders: "Trading Fees To Coin Holders",
  runnerCreator: "RUNNER Creator Fees To Team",
  runnerBuyback: "RUNNER Buyback And Burn",
  runnerHolders: "INJ Rewards To RUNNER Holders",
};

const readPending = async (api: ChainApi, markets: string[]): Promise<Pending[]> => {
  const values: Record<string, any[]> = {};
  for (const key of PENDING) {
    values[key] = await api.multiCall({ abi: ABI[key], calls: markets, permitFailure: key === "holderFees" });
  }
  return markets.map((_, i) => Object.fromEntries(PENDING.map((key) => [key, BigInt(values[key][i] ?? 0)])) as Pending);
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { quote, fromBlock, toBlock, fromApi, toApi, markets } = await getMarketWindow(options);
  if (!markets.length) return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };

  const existing = markets.filter((m) => m.existedAtFrom);
  const targets = markets.map((m) => m.market);
  const toPending = await readPending(toApi, targets);
  const fromPending = await readPending(fromApi, existing.map((m) => m.market));
  const toFeeBps = await toApi.multiCall({ abi: ABI.tradeFeeBps, calls: targets });
  const fromFeeBps = await fromApi.multiCall({ abi: ABI.tradeFeeBps, calls: existing.map((m) => m.market) });
  const fromPhase = await fromApi.multiCall({ abi: ABI.phase, calls: existing.map((m) => m.market) });

  const byMarket = async (eventAbi: string) => {
    const logs = await options.getLogs({ eventAbi, fromBlock: fromBlock + 1, toBlock, noTarget: true, onlyArgs: false });
    const grouped: Record<string, any[]> = Object.fromEntries(targets.map((t) => [t.toLowerCase(), []]));
    logs.forEach((log: any) => grouped[log.address.toLowerCase()]?.push(log.args));
    return targets.map((t) => grouped[t.toLowerCase()]);
  };
  const collected = await byMarket(ABI.feesCollected);
  const holderClaims = await byMarket(ABI.holderFeesClaimed);

  markets.forEach((m: ActiveMarket, i) => {
    const j = existing.indexOf(m);
    const before = j === -1 ? undefined : fromPending[j];
    const delta = (key: keyof Pending) => toPending[i][key] - (before ? before[key] : 0n);
    const sum = (logs: any[], key: string) => logs.reduce((acc, log) => acc + BigInt(log[key]), 0n);

    const dest = {
      creator: delta("creatorFees") + sum(collected[i], "creator"),
      platform: delta("platformFees") + sum(collected[i], "platform"),
      holders: delta("holderFees") + sum(holderClaims[i], "amount"),
      buyback: delta("buybackFees") + sum(collected[i], "buyback"),
      strategy: delta("treasuryFees") + sum(collected[i], "strategy"),
      liquidity: delta("cumulativeLiquidityFees"),
    };
    Object.entries(dest).forEach(([key, value]) => {
      if (value < 0n) throw new Error(`RunUp: negative ${key} fees for market ${m.market} in blocks ${fromBlock}-${toBlock}`);
    });
    const total = Object.values(dest).reduce((a, b) => a + b, 0n);

    const isPlatform = m.preset === PLATFORM_PRESET;
    const inFoundingSale = isPlatform && (j === -1 || Number(fromPhase[j]) === 0);
    const rateChanged = j !== -1 && Number(fromFeeBps[j]) !== Number(toFeeBps[i]);
    if (!inFoundingSale && !rateChanged) {
      const expected = (m.volume * BigInt(toFeeBps[i])) / 10_000n;
      const diff = total > expected ? total - expected : expected - total;
      if (diff > expected / 1000n + 10_000n)
        throw new Error(`RunUp: market ${m.market} fees ${total} do not match volume ${m.volume} at ${toFeeBps[i]} bps in blocks ${fromBlock}-${toBlock}`);
    }

    dailyFees.add(quote, total, isPlatform ? LABELS.runnerFees : LABELS.coinFees);

    dailyRevenue.add(quote, dest.platform, LABELS.platform);
    dailyProtocolRevenue.add(quote, dest.platform, LABELS.platform);
    dailySupplySideRevenue.add(quote, dest.liquidity, LABELS.liquidity);
    dailySupplySideRevenue.add(quote, dest.strategy, LABELS.strategy);

    if (isPlatform) {
      dailyRevenue.add(quote, dest.creator, LABELS.runnerCreator);
      dailyProtocolRevenue.add(quote, dest.creator, LABELS.runnerCreator);
      dailyRevenue.add(quote, dest.buyback, LABELS.runnerBuyback);
      dailyHoldersRevenue.add(quote, dest.buyback, LABELS.runnerBuyback);
      dailyRevenue.add(quote, dest.holders, LABELS.runnerHolders);
      dailyHoldersRevenue.add(quote, dest.holders, LABELS.runnerHolders);
    } else {
      dailySupplySideRevenue.add(quote, dest.creator, LABELS.creators);
      dailySupplySideRevenue.add(quote, dest.buyback, LABELS.buybacks);
      dailySupplySideRevenue.add(quote, dest.holders, LABELS.holders);
    }
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Trading fees paid on every buy and sell of RunUp coins (1.3% of the USDC amount, 2% for the RUNUP token), on the bonding curve and in the pool a coin graduates into, plus the 1.3% fee on RUNUP founding-sale tickets.",
  Revenue: "The platform's cut of every coin's trading fees, plus the RUNUP token's creator share (paid to the team wallet), its buyback and burn share and its INJ holder rewards share.",
  ProtocolRevenue: "The platform's cut of every coin's trading fees (1.10% of each trade on the bonding curve, 0.40% to 0.60% after graduation depending on the coin's fee split) and the RUNUP token's creator share, which goes to the team wallet that deployed RunUp.",
  HoldersRevenue: "The share of RUNUP token trading fees used to buy back and burn RUNUP, and the share swapped to INJ and paid to RUNUP holders.",
  SupplySideRevenue: "Trading fees of community coins paid to their creators, to their own buybacks, perp strategy treasuries and INJ holder rewards, and fees left in graduated pools as liquidity (all coins including RUNUP), plus the RUNUP token's strategy treasury share.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.coinFees]: "Trading fees on community coins: 1.3% of each trade's USDC amount.",
    [LABELS.runnerFees]: "Trading fees on the RUNUP platform token: 2% of each trade's USDC amount, 1.3% on founding-sale tickets.",
  },
  Revenue: {
    [LABELS.platform]: "Platform cut of trading fees, read from each market's platform fee balance and platform fee claims.",
    [LABELS.runnerCreator]: "Creator share of RUNUP token fees, paid to the team wallet that deployed RunUp.",
    [LABELS.runnerBuyback]: "RUNUP token fees sent to its treasury vault to buy back and burn RUNUP.",
    [LABELS.runnerHolders]: "RUNUP token fees swapped to INJ and distributed to RUNUP holders.",
  },
  ProtocolRevenue: {
    [LABELS.platform]: "Platform cut of trading fees, read from each market's platform fee balance and platform fee claims.",
    [LABELS.runnerCreator]: "Creator share of RUNUP token fees, paid to the team wallet that deployed RunUp.",
  },
  HoldersRevenue: {
    [LABELS.runnerBuyback]: "RUNUP token fees sent to its treasury vault to buy back and burn RUNUP.",
    [LABELS.runnerHolders]: "RUNUP token fees swapped to INJ and distributed to RUNUP holders.",
  },
  SupplySideRevenue: {
    [LABELS.creators]: "Creator share of community coin fees (0.20% of each trade on the bonding curve).",
    [LABELS.liquidity]: "Fees left in a graduated coin's pool as liquidity.",
    [LABELS.strategy]: "Fees sent to a coin's treasury vault to fund its leveraged perp strategy, RUNUP included.",
    [LABELS.buybacks]: "Community coin fees sent to the coin's treasury vault to buy back and burn that coin.",
    [LABELS.holders]: "Community coin fees swapped to INJ and distributed to that coin's holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.INJECTIVE],
  start: "2026-10-02",
  methodology,
  breakdownMethodology,
};

export default adapter;
