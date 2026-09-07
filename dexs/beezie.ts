import request from "graphql-request";
import { Dependencies, type FetchOptions, type SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { addTokensReceived, getSolanaReceived } from "../helpers/token";

const graphUrl = "https://indexer.beezie.io/";

type FetchItemResult = {
  clawMachine: string;
  user: string;
  tokenId: string;
  currency: string;
  swapValue: string;
  price: string;
  timestamp: string;
};

const getQuery = (
  fromTimestamp: number,
  toTimestamp: number,
  endCursor: any,
) => `{
  clawMachineWins(
    where: {
      timestamp_gte: "${fromTimestamp}",
      timestamp_lt: "${toTimestamp}"
    },
    orderBy: "timestamp",
    orderDirection: "desc",
    after: ${endCursor ? `"${endCursor}"` : null},
    limit: 1000
  ) {
    items {
      clawMachine,
      user,
      tokenId,
      currency,
      swapValue,
      price,
      timestamp
    },
    pageInfo {
      endCursor,
      hasNextPage
    },
    totalCount
  }
}`;

const fetchFlow: any = async ({
  createBalances,
  fromTimestamp,
  toTimestamp,
}: FetchOptions) => {
  const dailyVolume = createBalances();

  let hasNextPage = true;
  let endCursor = null;
  while (hasNextPage) {
    const query: string = getQuery(fromTimestamp, toTimestamp, endCursor);
    const res = await request(graphUrl, query);
    if (res?.clawMachineWins?.items?.length > 0) {
      res.clawMachineWins.items.forEach((item: FetchItemResult) =>
        dailyVolume.add(item.currency, item.swapValue),
      );
    }
    hasNextPage = res?.clawMachineWins?.pageInfo?.hasNextPage ?? false;
    endCursor = res?.clawMachineWins?.pageInfo?.endCursor ?? null;
  }
  return { dailyVolume };
};

const abi = {
  clawMachineCreated: "event ClawMachineCreated(address indexed clawMachine)",
  clawMachineV3Created: "event ClawMachineV3Created(address indexed clawMachine)",
  played: "event Played(address indexed user, uint256 indexed amount)",
  playedV3:
    "event Played(address indexed user, uint256 indexed playId, uint256 nonce, uint8 times, uint256 amount, bytes32 seedCommitment)",
  playToken: "function playToken() view returns (address)",
};

const clawMachineFactory = "0x8B50BAB7464764f6d102a9819B7db967256Db14c";
const bidRouter = "0x80d7C04B738eF379971a6b73f25B1A71ea1c820D";
const paymentToken = ADDRESSES.base.USDC;

// Transfers from these addresses to BidRouter are claw swaps (not P2P marketplace).
// 0xaa9cfa... is the factory's clawFinanceWallet: since ClawMachineV3 (2026-07-23)
// it receives full play prices and funds swap-back buybacks through the BidRouter.
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

const fetchBase = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // V1/V2 and V3 machines are announced through different events on the same
  // (upgradeable) factory.
  const [clawMachineCreatedLogs, clawMachineV3CreatedLogs] = await Promise.all([
    options.getLogs({
      target: clawMachineFactory,
      eventAbi: abi.clawMachineCreated,
      fromBlock: 40451500,
      cacheInCloud: true,
    }),
    options.getLogs({
      target: clawMachineFactory,
      eventAbi: abi.clawMachineV3Created,
      fromBlock: 40451500,
      cacheInCloud: true,
    }),
  ]);

  const clawMachines = [
    ...clawMachineCreatedLogs,
    ...clawMachineV3CreatedLogs,
  ].map((log: any) => log.clawMachine);

  const playTokens = await options.api.multiCall({
    abi: abi.playToken,
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

  // V2 and V3 emit different Played signatures; fetch both. onlyArgs: false so
  // log.address is available to map each play to its machine's play token.
  const [playedLogs, playedV3Logs] = await Promise.all([
    options.getLogs({
      targets: validMachines,
      eventAbi: abi.played,
      onlyArgs: false,
    }),
    options.getLogs({
      targets: validMachines,
      eventAbi: abi.playedV3,
      onlyArgs: false,
    }),
  ]);

  for (const log of [...playedLogs, ...playedV3Logs]) {
    const machine = log.address?.toLowerCase() ?? "";
    const token = machineToToken.get(machine);
    if (!token) continue;

    dailyVolume.add(token, log.args.amount);
  }

  const swapVolume = options.createBalances();
  await addTokensReceived({
    options,
    target: bidRouter,
    balances: swapVolume,
    token: paymentToken,
    fromAdddesses: [...CLAW_MANAGERS],
  });

  const marketplaceVolume = options.createBalances();
  await addTokensReceived({
    options,
    target: bidRouter,
    balances: marketplaceVolume,
    token: paymentToken,
    // Indexer rows use `from_address`; parsed getLogs events use `from`
    logFilter: (log: any) =>
      !CLAW_MANAGERS.has((log.from ?? log.from_address ?? "").toLowerCase()),
  });

  dailyVolume.add(swapVolume);
  dailyVolume.add(marketplaceVolume);

  return { dailyVolume };
};

// --- Solana ---
//
// Beezie on Solana runs its own Anchor programs, so there are no Played logs or
// BidRouter hop to read. Volume comes from two places:
//
// 1. Claw plays — every play transfers USDC to the claw factory's
//    `centralized_pool_wallet`, which receives nothing else. Verified against
//    mainnet: 10 inflow transfers totalling 75.00 USDC against 10 recorded
//    plays worth $75.00, and 4 transfers totalling 25.00 against 4 plays worth
//    $25.00 — inflow count matches play count exactly.
//
// 2. Swaps and marketplace sales — these have NO fixed recipient to read. A
//    buyback pays the user directly from the pool wallet, and a sale pays the
//    seller directly, both arbitrary wallets. But each charges a known 600bps
//    fee to a dedicated wallet, so the traded value is recovered from the fee.
//    Exact arithmetic rather than an estimate, though it does assume the rate
//    stays 600bps — if the claw's `Machine.fee_bps` or the Core royalty
//    percentage is ever retuned, this must be retuned with it.

const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const SOLANA_CLAW_POOL_WALLET = "3K3MmyppnUDhd2o7qSYL8fmcw44f9gm4MdweFr1kF1xY";

// 600 bps total on both paths: the claw's buyback fee, and the Core royalties
// plugin's platform + creator split on a marketplace sale.
const SOLANA_FEE_BPS = 600;
const SOLANA_FEE_WALLETS = [
  "EXj5URFQ1kWrWEbHJpK4kURvzrtA1dtCgCFrUG6Sx8ty", // claw buyback fee
  "ppUYoqfCmntA9MBtH5PjD1HS3WQQUw58PmpzbNA4e4p", // marketplace platform fee
  "DVNnFArZavoagFdyHyEYH9gmRRoma2vLW5dsy8Y2q9WR", // marketplace creator fee
];

const fetchSolana = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Restricted to USDC — every Beezie settlement on Solana is USDC, so any
  // other token in these wallets is a stray transfer, not traded value.
  await getSolanaReceived({
    options,
    balances: dailyVolume,
    targets: [SOLANA_CLAW_POOL_WALLET],
    mints: [SOLANA_USDC],
  });

  const fees = options.createBalances();
  await getSolanaReceived({
    options,
    balances: fees,
    targets: SOLANA_FEE_WALLETS,
    mints: [SOLANA_USDC],
  });
  dailyVolume.addBalances(fees.clone(10_000 / SOLANA_FEE_BPS));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    // [CHAIN.FLOW]: {
    // 	start: '2025-01-04',
    // 	fetch: fetchFlow,
    // },
    [CHAIN.BASE]: {
      start: "2026-01-06",
      fetch: fetchBase,
    },
    [CHAIN.SOLANA]: {
      start: "2026-06-28",
      fetch: fetchSolana,
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
