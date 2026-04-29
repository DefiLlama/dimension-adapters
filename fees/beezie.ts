import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

/**
 * Beezie DefiLlama Dimension Adapter
 *
 * Tracks fees from:
 * 1. Claw Machine plays (V1 on Flow, V2 on Base)
 * 2. Secondary market trades via BidRouter (both chains)
 *
 * V1 (Flow): Played(user, amount, commission) — protocol takes `purchaseFeeBps` as commission
 * V2 (Base): Played(user, amount) — entire play amount goes to protocol (earningsBalance)
 * BidRouter:  BidFulfilled(bidder, fulfiller, salt, paymentToken, bidAmount, collection, tokenId)
 */

// --- ABIs ---

const factoryAbi = {
  clawMachineCreated: "event ClawMachineCreated(address indexed clawMachine)",
};

const clawMachineV1Abi = {
  played: "event Played(address indexed user, uint256 indexed amount, uint256 commission)",
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
  //flow doesnt have a good rpc to go back this long
  // [CHAIN.FLOW]: {
  //   factory: "0xde545660B5EeA686286b578F7491C7E5CEeaf895",
  //   factoryStartBlock: 12572646,
  //   bidRouter: "0x00ccDBFc51a30f01A1Ea5FC3208e2f5Ed5Fc7660",
  //   version: "v1",
  //   start: "2024-11-01",
  //   paymentTokens: ["0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e"], // PYUSD
  // },
};

// --- Fetch Logic ---

const fetchClawMachineAddresses = async (options: FetchOptions, factoryAddress: string, startBlock: number): Promise<string[]> => {
  const logs = await options.getLogs({
    target: factoryAddress,
    eventAbi: factoryAbi.clawMachineCreated,
    fromBlock: startBlock,
    cacheInCloud: true,
  });

  return logs.map((log: any) => log.clawMachine);
};

const fetchClawFees = async (options: FetchOptions, clawMachines: string[], version: "v1" | "v2") => {
  if (!clawMachines.length) {
    return { dailyFees: options.createBalances() };
  }

  // Get play token for each machine (permitFailure in case some contracts are invalid)
  const playTokens = await options.api.multiCall({
    abi: version === "v2" ? clawMachineV2Abi.playToken : clawMachineV1Abi.playToken,
    calls: clawMachines,
    permitFailure: true,
  });

  // Build a map of machine address -> play token, skipping failed calls
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
    // V2: Played(user, amount) — entire amount is protocol fee
    const logs = await options.getLogs({
      targets: validMachines,
      eventAbi: clawMachineV2Abi.played,
    });

    for (const log of logs) {
      const machine = log.address?.toLowerCase() ?? "";
      const token = machineToToken.get(machine);
      if (!token) continue;

      dailyFees.add(token, log.amount, "Claw Machine Fees");
    }
  } else {
    // V1: Played(user, amount, commission) — commission goes to protocol
    const logs = await options.getLogs({
      targets: validMachines,
      eventAbi: clawMachineV1Abi.played,
    });

    for (const log of logs) {
      const machine = log.address?.toLowerCase() ?? "";
      const token = machineToToken.get(machine);
      if (!token) continue;

      dailyFees.add(token, log.commission, "Claw Machine Fees");
    }
  }

  return { dailyFees };
};

// Claw manager addresses — transfers from these to BidRouter are claw swaps
const CLAW_MANAGERS = new Set(
  [
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

const fetchBidRouterVolume = async (options: FetchOptions, bidRouterAddress: string) => {
  const tokens = config[options.chain].paymentTokens;

  // Claw swaps: transfers from claw manager addresses
  const swapVolume = options.createBalances();
  await addTokensReceived({
    options,
    target: bidRouterAddress,
    balances: swapVolume,
    tokens,
    fromAdddesses: [...CLAW_MANAGERS],
  });

  // Marketplace purchases: transfers from anyone else
  const marketplaceVolume = options.createBalances();
  await addTokensReceived({
    options,
    target: bidRouterAddress,
    balances: marketplaceVolume,
    tokens,
    logFilter: (log: any) => !CLAW_MANAGERS.has((log.from ?? "").toLowerCase()),
  });

  return { swapVolume, marketplaceVolume };
};

// --- Main Fetch ---

const fetch = async (options: FetchOptions) => {
  const chainConfig = config[options.chain];

  // 1. Discover all claw machines from factory events
  const clawMachines = await fetchClawMachineAddresses(options, chainConfig.factory, chainConfig.factoryStartBlock);

  // 2. Get claw machine fees
  const claw = await fetchClawFees(options, clawMachines, chainConfig.version);

  // 3. Get BidRouter volume split by swaps vs marketplace
  const bids = await fetchBidRouterVolume(options, chainConfig.bidRouter);

  // 4. Combine fees
  // Daily fees = claw fees + 6% of claw swaps + 5% of marketplace
  const dailyFees = options.createBalances();
  dailyFees.addBalances(claw.dailyFees, "Claw Machine Fees");
  dailyFees.addBalances(bids.swapVolume.clone(0.06), "Swap Fees");
  dailyFees.addBalances(bids.marketplaceVolume.clone(0.05), "Marketplace Fees");

  return {
    dailyFees,
  };
};

// --- Methodology ---

const methodology = {
  Fees: "Fees from claw machine plays (V1: commission, V2: full amount), 6% on BidRouter swaps, and 5% on marketplace purchases.",
};

const breakdownMethodology = {
  Fees: {
    "Claw Machine Fees": "Fees from claw machine plays (V1: commission, V2: full amount)",
    "Swap Fees": "6% fee on BidRouter swaps from claw managers",
    "Marketplace Fees": "5% fee on BidRouter marketplace purchases",
  },
};

// --- Adapter Export ---

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  skipBreakdownValidation: true,
  pullHourly: true,
  fetch,
  adapter: config,
};

export default adapter;