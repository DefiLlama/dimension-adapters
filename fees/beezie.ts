import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getSolanaReceived } from "../helpers/token";

// Tracks claw machine plays and BidRouter trades (swaps + marketplace).
// Solana runs Beezie's own Anchor programs and is handled separately below.

// --- ABIs ---

const factoryAbi = {
  clawMachineCreated: "event ClawMachineCreated(address indexed clawMachine)",
};

const clawMachineV1Abi = {
  played:
    "event Played(address indexed user, uint256 indexed amount, uint256 commission)",
  playToken: "function playToken() view returns (address)",
};

const clawMachineV2Abi = {
  played: "event Played(address indexed user, uint256 indexed amount)",
  playToken: "function playToken() view returns (address)",
};

// --- Contract Addresses ---

const config: Record<
  string,
  {
    factory: string;
    factoryStartBlock: number;
    bidRouter: string;
    version: "v1" | "v2";
    start: string;
    paymentTokens: string[];
  }
> = {
  [CHAIN.BASE]: {
    factory: "0x8B50BAB7464764f6d102a9819B7db967256Db14c",
    factoryStartBlock: 40451500,
    bidRouter: "0x80d7C04B738eF379971a6b73f25B1A71ea1c820D",
    version: "v2",
    start: "2026-01-06",
    paymentTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"], // USDC
  },
  // Flow's RPCs cap eth_getLogs at 10k blocks, so the initial factory scan is
  // ~6,200 sequential calls — cacheInCloud makes that a one-time cost.
  [CHAIN.FLOW]: {
    factory: "0xde545660B5EeA686286b578F7491C7E5CEeaf895",
    factoryStartBlock: 12572646,
    bidRouter: "0x00ccDBFc51a30f01A1Ea5FC3208e2f5Ed5Fc7660",
    version: "v1",
    start: "2024-11-01",
    paymentTokens: ["0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e"], // PYUSD
  },
};

// --- Fetch Logic ---

const fetchClawMachineAddresses = async (
  options: FetchOptions,
  factoryAddress: string,
  startBlock: number,
): Promise<string[]> => {
  const logs = await options.getLogs({
    target: factoryAddress,
    eventAbi: factoryAbi.clawMachineCreated,
    fromBlock: startBlock,
    cacheInCloud: true,
  });

  return logs.map((log: any) => log.clawMachine);
};

const fetchClawFees = async (
  options: FetchOptions,
  clawMachines: string[],
  version: "v1" | "v2",
) => {
  if (!clawMachines.length) {
    return { dailyFees: options.createBalances() };
  }

  const playTokens = await options.api.multiCall({
    abi:
      version === "v2"
        ? clawMachineV2Abi.playToken
        : clawMachineV1Abi.playToken,
    calls: clawMachines,
    permitFailure: true,
  });

  const machineToToken = new Map<string, string>();
  const validMachines: string[] = [];
  clawMachines.forEach((machine, i) => {
    if (playTokens[i]) {
      machineToToken.set(machine.toLowerCase(), playTokens[i]);
      validMachines.push(machine);
    }
  });

  const dailyFees = options.createBalances();

  if (version === "v2") {
    // Played.amount = price * times (full play cost). Users can SWAP the won card back within
    // 15 mins and recover the play price minus 5%, so 5% is the non-refundable fee per pull.
    const logs = await options.getLogs({
      targets: validMachines,
      eventAbi: clawMachineV2Abi.played,
      onlyArgs: false,
    });

    for (const log of logs) {
      const machine = log.address?.toLowerCase() ?? "";
      const token = machineToToken.get(machine);
      if (!token) continue;

      dailyFees.add(
        token,
        (BigInt(log.args.amount.toString()) * 500n) / 10_000n,
        "Claw Machine Fees",
      );
    }
  } else {
    // V1: commission field = protocol's take per play (explicit on-chain fee)
    const logs = await options.getLogs({
      targets: validMachines,
      eventAbi: clawMachineV1Abi.played,
      onlyArgs: false,
    });

    for (const log of logs) {
      const machine = log.address?.toLowerCase() ?? "";
      const token = machineToToken.get(machine);
      if (!token) continue;

      dailyFees.add(token, log.args.commission, "Claw Machine Fees");
    }
  }

  return { dailyFees };
};

// Transfers from these addresses to BidRouter are claw swaps (not P2P marketplace).
// 0xaa9cfa... is the factory's clawFinanceWallet: since ClawMachineV3 (2026-07-23)
// it receives full play prices and funds swap-back buybacks through the BidRouter,
// where the 6% fee is taken (V3 machines no longer take a cut at play time).
const CLAW_MANAGERS = new Set(
  [
    "0xaa9cfaa6cab4d3bfeeab5dee99401df22f855a6b",
    "0x2129836a9ee21cD92129B05453F4Bdbd879566D7",
    "0x46e2Af76235d2fb959cf725f73443042a9aF7080",
    "0x279Dd5eE509783D04F002FDFc3d688a911557305",
    "0x61aA186Be094041F5C8C41c6AadF210532111fDc",
    "0xBa2b26Dd25C57838B7E500c539e0d85293d96FD4",
    "0xa69D72428AfFcCEcAc7C2fa91492480273E41200",
    "0x48C27EF6218Bc4f0714dd00df6941868B1afa54a",
    "0x69daaBeD9750a96F0eE7340b800930366D9dC976",
    "0x3BD1141C1dc3E74197411452DcAd9B1b2b6329F2",
  ].map((a) => a.toLowerCase()),
);

const fetchBidRouterVolume = async (
  options: FetchOptions,
  bidRouterAddress: string,
) => {
  const tokens = config[options.chain].paymentTokens;

  const swapVolume = options.createBalances();
  await addTokensReceived({
    options,
    target: bidRouterAddress,
    balances: swapVolume,
    tokens,
    fromAdddesses: [...CLAW_MANAGERS],
  });

  const marketplaceVolume = options.createBalances();
  await addTokensReceived({
    options,
    target: bidRouterAddress,
    balances: marketplaceVolume,
    tokens,
    // Indexer rows use `from_address`; parsed getLogs events use `from`
    logFilter: (log: any) =>
      !CLAW_MANAGERS.has((log.from ?? log.from_address ?? "").toLowerCase()),
  });

  return { swapVolume, marketplaceVolume };
};

// --- Solana ---
//
// Beezie on Solana runs its own Anchor programs, so there are no equivalent
// events to read. Both cuts are paid on-chain to dedicated fee wallets that
// receive nothing else, so each is read straight off its wallet.
//
// Note there is no Claw Machine Fees line on Solana: unlike Base, no cut is
// taken at pull time. The full play price goes to a hot wallet and ~96% of it
// flows back out when players swap cards back, so Beezie's claw take is
// entirely the 6% swap fee below. Counting plays as revenue would overstate it
// by roughly 25x.

const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// 600 bps buyback fee, configured identically on every claw machine
// (Machine.fee_bps / fee_wallets). Charged when a player swaps a won card back.
const SOLANA_CLAW_FEE_WALLET = "EXj5URFQ1kWrWEbHJpK4kURvzrtA1dtCgCFrUG6Sx8ty";

// Beezie's cut of a secondary sale, totalling 600 bps - matching Base. The
// beezie_marketplace program takes no fee itself; it settles the Metaplex Core
// royalties plugin, which splits that 600bps across two wallets: a 5% platform
// fee and a 1% creator commission. Beezie is the creator on every item, so both
// legs are protocol revenue and both are counted.
//
// Split by whole percent (the plugin's `percentage` is a u8 summing to 100), so
// in practice these land at ~4.98% and ~1.02% rather than exactly 5/1. Reading
// the wallets reports whatever was actually paid.
//
// If an item is ever tokenized with a third-party consignor as creator, that
// item's creator share stops being Beezie revenue and this would overstate.
const SOLANA_MARKETPLACE_FEE_WALLETS = [
  "ppUYoqfCmntA9MBtH5PjD1HS3WQQUw58PmpzbNA4e4p", // 5% platform fee
  "DVNnFArZavoagFdyHyEYH9gmRRoma2vLW5dsy8Y2q9WR", // 1% creator commission
];

const fetchSolana = async (options: FetchOptions) => {
  // Restricted to USDC: every Beezie settlement on Solana is USDC, so anything
  // else arriving in these wallets is a stray transfer rather than revenue.
  const swapFees = options.createBalances();
  await getSolanaReceived({
    options,
    balances: swapFees,
    targets: [SOLANA_CLAW_FEE_WALLET],
    mints: [SOLANA_USDC],
  });

  const marketplaceFees = options.createBalances();
  await getSolanaReceived({
    options,
    balances: marketplaceFees,
    targets: SOLANA_MARKETPLACE_FEE_WALLETS,
    mints: [SOLANA_USDC],
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(swapFees, "Swap Fees");
  dailyFees.addBalances(marketplaceFees, "Marketplace Fees");

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetch = async (options: FetchOptions) => {
  const chainConfig = config[options.chain];

  const clawMachines = await fetchClawMachineAddresses(
    options,
    chainConfig.factory,
    chainConfig.factoryStartBlock,
  );
  const claw = await fetchClawFees(options, clawMachines, chainConfig.version);
  const bids = await fetchBidRouterVolume(options, chainConfig.bidRouter);

  // Claw: 5% non-refundable per play. BidRouter: 6% on every swap and marketplace sale.
  const dailyFees = options.createBalances();
  dailyFees.addBalances(claw.dailyFees, "Claw Machine Fees");
  dailyFees.addBalances(bids.swapVolume.clone(0.06), "Swap Fees");
  dailyFees.addBalances(bids.marketplaceVolume.clone(0.06), "Marketplace Fees");

  // Beezie keeps 100% of fees - no LP/seller/creator share - so revenue == fees.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "6% on every BidRouter swap-back and marketplace sale, plus (until 2026-07-23) 5% of each claw pull taken by V1/V2 machines at play time. ClawMachineV3 no longer takes a pull-time cut: the full play price goes to the claw finance wallet and Beezie's take is realized as the 6% fee when cards are swapped back through the BidRouter - the same model as Solana, where the claw take is the 6% swap fee alone and the marketplace's 6% is paid out by the Metaplex Core royalties plugin. Trade volume itself is not counted - only Beezie's cut.",
  Revenue:
    "Beezie keeps 100% of all fees - no share goes to sellers, creators, or LPs.",
  ProtocolRevenue: "All revenue goes to the Beezie treasury.",
};

const breakdownMethodology = {
  Fees: {
    "Claw Machine Fees":
      "5% of play price per pull (V1: on-chain commission field; V2: Played.amount x 5%) - the non-refundable cut after a SWAP-back. Ended 2026-07-23 when ClawMachineV3 moved the cut to swap-back time; not charged on Solana either, where the claw likewise takes its cut on the swap",
    "Swap Fees":
      "6% of the buyback value when a user swaps a won item back - through BidRouter on Base (funded by the claw finance wallet since V3), or paid to the claw program's fee wallet on Solana",
    "Marketplace Fees":
      "6% on every P2P collectible sale through BidRouter; on Solana, the same 6% paid by the Core royalties plugin, split across Beezie's platform-fee and creator wallets",
  },
  Revenue: {
    "Claw Machine Fees": "5% claw cut retained by Beezie",
    "Swap Fees": "6% swap fee retained by Beezie",
    "Marketplace Fees": "6% marketplace fee retained by Beezie",
  },
  ProtocolRevenue: {
    "Claw Machine Fees": "5% claw cut to Beezie treasury",
    "Swap Fees": "6% swap fee to Beezie treasury",
    "Marketplace Fees": "6% marketplace fee to Beezie treasury",
  },
};

// --- Adapter Export ---

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  pullHourly: true,
  fetch,
  adapter: {
    ...config,
    // Own fetch - Solana reads fee wallets rather than EVM events, so it does
    // not use `config` or the shared `fetch`. Starts at the first fee received,
    // not the first play: earlier plays produced no fee to report.
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-07-06" },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
};

export default adapter;
