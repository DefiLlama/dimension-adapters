import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// Tracks claw machine plays and BidRouter trades (swaps + marketplace).

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

  const playTokens = await options.api.multiCall({
    abi: version === "v2" ? clawMachineV2Abi.playToken : clawMachineV1Abi.playToken,
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

      dailyFees.add(token, BigInt(log.args.amount.toString()) * 500n / 10_000n, "Claw Machine Fees");
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

// Transfers from these addresses to BidRouter are claw swaps (not P2P marketplace)
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
    logFilter: (log: any) => !CLAW_MANAGERS.has((log.from ?? "").toLowerCase()),
  });

  return { swapVolume, marketplaceVolume };
};

const fetch = async (options: FetchOptions) => {
  const chainConfig = config[options.chain];

  const clawMachines = await fetchClawMachineAddresses(options, chainConfig.factory, chainConfig.factoryStartBlock);
  const claw = await fetchClawFees(options, clawMachines, chainConfig.version);
  const bids = await fetchBidRouterVolume(options, chainConfig.bidRouter);

  // Claw: 5% non-refundable per play. BidRouter: 6% on every swap and marketplace sale.
  const dailyFees = options.createBalances();
  dailyFees.addBalances(claw.dailyFees, "Claw Machine Fees");
  dailyFees.addBalances(bids.swapVolume.clone(0.06), "Swap Fees");
  dailyFees.addBalances(bids.marketplaceVolume.clone(0.06), "Marketplace Fees");

  // Beezie keeps 100% of fees — no LP/seller/creator share — so revenue == fees.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "5% of each claw pull (users can SWAP the won card back within 15 mins and recover the play price minus 5%), plus 6% on every BidRouter swap and marketplace sale. Trade volume itself is not counted — only Beezie's cut.",
  Revenue: "Beezie keeps 100% of all fees — no share goes to sellers, creators, or LPs.",
  ProtocolRevenue: "All revenue goes to the Beezie treasury.",
};

const breakdownMethodology = {
  Fees: {
    "Claw Machine Fees": "5% of play price per pull (V1: on-chain commission field; V2: Played.amount x 5%) — the non-refundable cut after a SWAP-back",
    "Swap Fees": "6% of the buyback value when a user swaps a won item back through BidRouter",
    "Marketplace Fees": "6% on every P2P collectible sale through BidRouter",
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
  adapter: config,
};

export default adapter;