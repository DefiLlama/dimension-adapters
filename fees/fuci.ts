// Fuci (https://www.fuci.family): fees from AI agents on Arc (agent factory, escrow) and from Fuci Launch, its token launchpad.
// FuciAgentFactory: every agent created on-chain pays its fee (1 USDC) to the Fuci treasury and emits AgentCreated.
// FuciEscrow: every job paid out to its agent pays a fee (1% at launch, capped at 5%) to the treasury and emits Released.
// Fuci Launch: a Uniswap v4 token launchpad on Arc. Every launch is a TOKEN/$FUCI pool with its own hook and the whole
// supply in one locked v4 position owned by the launchpad.
//   - every swap pays the pool's LP fee (1%, launchpad `feeBps` = 100), which accrues to that locked position. Anyone
//     can call `collectAndBurn(token)`, which collects those fees and burns BOTH sides (emits FeesBurned); a daily
//     job calls it for every launch. Nothing goes to a team wallet.
//   - buys in the first seconds after a launch also pay a decaying snipe tax in $FUCI, which the launch's hook sends
//     to the Fuci treasury (emits SnipeTax).
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// FuciAgentFactory on Arc mainnet, verified source: https://explorer.arc.io/address/0x77fa3ae9604539fee8f199adc02f12f318c2bfbc?tab=contract
const FACTORY = "0x77fa3ae9604539fee8f199adc02f12f318c2bfbc"; // FuciAgentFactory on Arc, deployed at block 22474356
// USDC on Arc (ERC-20 interface of the native USDC, 6 decimals): https://docs.arc.io
const USDC = ADDRESSES.arc.USDC;

// FuciEscrow on Arc mainnet (jobs between AI agents, paid in USDC), verified source:
// https://explorer.arc.io/address/0xb30d1c83454260614ccf06ae0f3c1af8b47515b1?tab=contract
const ESCROW = "0xb30d1c83454260614ccf06ae0f3c1af8b47515b1"; // deployed 2026-09-29

// Emitted once per agent; feePaid is the USDC (6 decimals) sent to the treasury in the same call.
const AGENT_CREATED = "event AgentCreated(uint256 indexed agentId, address indexed owner, uint256 feePaid, string name, string agentURI)";
// Emitted once per job paid out; fee is the USDC (6 decimals) sent to the treasury in the same call (refunds pay no fee).
const RELEASED = "event Released(uint256 indexed jobId, address indexed provider, uint256 paid, uint256 fee, address by)";

// Fuci Launch contracts, source-verified on Arc (Sourcify):
// https://explorer.arc.io/address/0x270e04b3d25B8DD29bb775Ebb9350Bde0ed4F271?tab=contract
const LAUNCHPAD = "0x270e04b3d25b8dd29bb775ebb9350bde0ed4f271";
// First block of the launchpad (2026-09-30), so the launch lookup never scans earlier.
const LAUNCHPAD_START_BLOCK = 23487323;
// Uniswap v4 PoolManager on Arc, read from the launchpad's `poolManager()`.
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
// $FUCI, the quote asset of every launch and Fuci's own token (launchpad `fuci()`).
// https://explorer.arc.io/token/0xE66d5169c5D235209D74E976E594060c44c64420
const FUCI = "0xe66d5169c5d235209d74e976e594060c44c64420";

const FUCI_LAUNCH =
  "event FuciLaunch(address indexed token, address indexed creator, address hook, address quoteAsset, bytes32 poolId, int24 tickStart, int24 tickBond, uint256 firstBuyUsdc, uint256 firstBuyFuci, uint256 firstBuyTokens)";
const FEES_BURNED = "event FeesBurned(address indexed token, uint256 fuciBurned, uint256 tokenBurned)";
const SNIPE_TAX = "event SnipeTax(address indexed token, address indexed treasury, uint256 fuciAmount, uint16 bps)";
const POOL_SWAP =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
// keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"), set so the PoolManager query is
// filtered to one launch pool at the node instead of scanning every v4 swap on Arc.
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

// v4 LP fees are in hundredths of a basis point (pips): 10_000 pips = 1%.
const PIPS = BigInt(1_000_000);
const ZERO = BigInt(0);

// Breakdown labels: where the fee comes from, and where it goes.
const CREATION_FEES = "Agent Creation Fees";
const CREATION_FEES_TO_TREASURY = "Agent Creation Fees To Treasury";
const ESCROW_FEES = "Escrow Job Fees";
const ESCROW_FEES_TO_TREASURY = "Escrow Job Fees To Treasury";
const FEES_IN_FUCI = "Launch Swap Fees In $FUCI";
const FEES_IN_TOKEN = "Launch Swap Fees In Launched Tokens";
const SNIPE = "Launch Snipe Tax";
const FUCI_BURNED = "$FUCI Burned";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const logs = await options.getLogs({ target: FACTORY, eventAbi: AGENT_CREATED });
  for (const log of logs) {
    dailyFees.add(USDC, log.feePaid, CREATION_FEES);
    // The factory sends the whole fee to the treasury in the same call: all of it is protocol revenue.
    dailyRevenue.add(USDC, log.feePaid, CREATION_FEES_TO_TREASURY);
    dailyProtocolRevenue.add(USDC, log.feePaid, CREATION_FEES_TO_TREASURY);
  }
  const released = await options.getLogs({ target: ESCROW, eventAbi: RELEASED });
  for (const log of released) {
    dailyFees.add(USDC, log.fee, ESCROW_FEES);
    // The escrow sends the whole fee to the treasury in the same call.
    dailyRevenue.add(USDC, log.fee, ESCROW_FEES_TO_TREASURY);
    dailyProtocolRevenue.add(USDC, log.fee, ESCROW_FEES_TO_TREASURY);
  }

  // Fuci Launch, from the launchpad's deployment on.
  const toBlock = await options.getToBlock();
  if (toBlock >= LAUNCHPAD_START_BLOCK) {
    // Every launch so far, from the launchpad's own events (cached; the list only grows).
    const launches = await options.getLogs({ target: LAUNCHPAD, eventAbi: FUCI_LAUNCH, fromBlock: LAUNCHPAD_START_BLOCK, toBlock, cacheInCloud: true });

    // LP fees, from each launch pool's Swap logs. A v4 Swap amount is the swapper's delta: negative is what they paid
    // in. The fee is charged on the input, so a buy pays it in $FUCI and a sell pays it in the launched token.
    for (const launch of launches) {
      const fuciIs0 = FUCI < String(launch.token).toLowerCase(); // v4 sorts currencies by address
      const swaps = await options.getLogs({ target: POOL_MANAGER, eventAbi: POOL_SWAP, topics: [SWAP_TOPIC, launch.poolId] });
      for (const s of swaps) {
        const fuci = BigInt(fuciIs0 ? s.amount0 : s.amount1);
        const token = BigInt(fuciIs0 ? s.amount1 : s.amount0);
        const fee = BigInt(s.fee);
        if (fuci < ZERO) {
          // Buy: the fee is $FUCI. collectAndBurn burns it, so it is revenue that accrues to $FUCI holders.
          const amount = (-fuci * fee) / PIPS;
          dailyFees.add(FUCI, amount, FEES_IN_FUCI);
          dailyRevenue.add(FUCI, amount, FEES_IN_FUCI);
        } else if (token < ZERO && fuci > ZERO) {
          // Sell: the fee is the launched token, which has no price feed, so it is valued in $FUCI at this swap's
          // own execution price: (tokenIn * fee) * (fuciOut / tokenIn) = fuciOut * fee. Burning it benefits that
          // token's holders, not $FUCI holders, so it is supply side.
          const amount = (fuci * fee) / PIPS;
          dailyFees.add(FUCI, amount, FEES_IN_TOKEN);
          dailySupplySideRevenue.add(FUCI, amount, FEES_IN_TOKEN);
        }
      }
    }

    // Snipe tax: $FUCI taken from early buys by each launch's hook and sent to the Fuci treasury.
    const hooks = launches.map((l: any) => String(l.hook).toLowerCase());
    if (hooks.length) {
      const taxes = await options.getLogs({ targets: hooks, eventAbi: SNIPE_TAX });
      for (const t of taxes) {
        dailyFees.add(FUCI, t.fuciAmount, SNIPE);
        dailyRevenue.add(FUCI, t.fuciAmount, SNIPE);
        dailyProtocolRevenue.add(FUCI, t.fuciAmount, SNIPE);
      }
    }

    // Holders revenue is the $FUCI actually burned, counted when collectAndBurn runs (usually once a day), not when
    // the fee accrues. The launched-token side of each burn goes to that token's holders and is not counted here.
    const burns = await options.getLogs({ target: LAUNCHPAD, eventAbi: FEES_BURNED });
    for (const b of burns) dailyHoldersRevenue.add(FUCI, b.fuciBurned, FUCI_BURNED);
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "USDC creation fee paid by users to create an AI agent on Arc through the Fuci agent factory (1 USDC per agent at launch; read from each AgentCreated event), plus the fee on escrow jobs paid out to an agent (1% of the job at launch; read from each FuciEscrow Released event), plus Fuci Launch trading fees: the 1% Uniswap v4 LP fee on every swap in a launch pool and the snipe tax on early buys.",
  UserFees: "Users pay all of the fees.",
  Revenue: "Creation fees, escrow fees and the Fuci Launch snipe tax (all sent to the Fuci treasury, a Safe multisig), plus Fuci Launch LP fees paid in $FUCI, which are all burned.",
  ProtocolRevenue: "Creation fees, escrow fees and the Fuci Launch snipe tax, all sent to the Fuci treasury (a Safe multisig).",
  SupplySideRevenue: "Fuci Launch LP fees paid in the launched token. They are burned too, which benefits that token's holders.",
  HoldersRevenue: "$FUCI burned by the Fuci launchpad's collectAndBurn, which collects each launch's LP fees and burns them, usually once a day.",
};

const breakdownMethodology = {
  Fees: {
    [CREATION_FEES]: "Agent creation fee, read from the feePaid field of AgentCreated events of the Fuci agent factory.",
    [ESCROW_FEES]: "Fee on escrow jobs paid out to the agent, read from the fee field of FuciEscrow Released events.",
    [FEES_IN_FUCI]: "1% Uniswap v4 LP fee on Fuci Launch buys, paid in $FUCI.",
    [FEES_IN_TOKEN]: "1% Uniswap v4 LP fee on Fuci Launch sells, paid in the launched token and valued in $FUCI at the swap's price.",
    [SNIPE]: "Decaying tax on buys right after a launch, taken in $FUCI by the launch's hook (SnipeTax events).",
  },
  UserFees: {
    [CREATION_FEES]: "Agent creation fee, read from the feePaid field of AgentCreated events of the Fuci agent factory.",
    [ESCROW_FEES]: "Fee on escrow jobs paid out to the agent, read from the fee field of FuciEscrow Released events.",
    [FEES_IN_FUCI]: "1% Uniswap v4 LP fee on Fuci Launch buys, paid in $FUCI.",
    [FEES_IN_TOKEN]: "1% Uniswap v4 LP fee on Fuci Launch sells, paid in the launched token and valued in $FUCI at the swap's price.",
    [SNIPE]: "Decaying tax on buys right after a launch, taken in $FUCI by the launch's hook (SnipeTax events).",
  },
  Revenue: {
    [CREATION_FEES_TO_TREASURY]: "The full creation fee, transferred to the Fuci treasury in the same transaction.",
    [ESCROW_FEES_TO_TREASURY]: "The full escrow fee, transferred to the Fuci treasury in the same transaction.",
    [FEES_IN_FUCI]: "Fuci Launch LP fees paid in $FUCI, all burned by collectAndBurn.",
    [SNIPE]: "Fuci Launch snipe tax, sent to the Fuci treasury.",
  },
  ProtocolRevenue: {
    [CREATION_FEES_TO_TREASURY]: "The full creation fee, transferred to the Fuci treasury in the same transaction.",
    [ESCROW_FEES_TO_TREASURY]: "The full escrow fee, transferred to the Fuci treasury in the same transaction.",
    [SNIPE]: "Fuci Launch snipe tax, sent to the Fuci treasury.",
  },
  SupplySideRevenue: {
    [FEES_IN_TOKEN]: "Fuci Launch LP fees paid in the launched token, burned for that token's holders.",
  },
  HoldersRevenue: {
    [FUCI_BURNED]: "$FUCI sent to the burn address by the launchpad's collectAndBurn (FeesBurned events).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-24", // factory deployed 2026-09-24 (block 22474356); Fuci Launch from block 23487323 (2026-09-30)
  methodology,
  breakdownMethodology,
};

export default adapter;
