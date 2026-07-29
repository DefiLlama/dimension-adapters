import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

// pmav.fun — fair launch memecoin launchpad on Robinhood Chain.
// Every coin launches as a real Uniswap v4 pool. Fee: 1% flat on every trade.
// Split: 0.7% to creator (supply-side), 0.3% to platform (protocol revenue).
// Source: https://pmav.fun/mcp → pmav_manifest tool
// https://pmav.fun/pmav-integration-guide.pdf
const TRADE_EVENT =
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 ethGross, uint256 ethNet, uint256 tokenAmount, uint160 sqrtPriceX96, uint128 tokensSold, uint128 raisedWei)";

// Emitted when the hook collects accumulated LP fees from a graduated pool.
const POOL_FEES_COLLECTED_EVENT =
  "event PoolFeesCollected(address indexed token, address indexed creatorRecipient, uint256 creatorWei, uint256 creatorTokens, uint256 platformWei, uint256 platformTokens)";

const WETH = ADDRESSES.robinhood.WETH;
const USDG = ADDRESSES.robinhood.USDG;

const CREATOR_SHARE_BPS = 7000n;
const BPS = 10_000n;

// ETH-curve hooks — fee is denominated in WETH.
const ETH_HOOKS = [
  "0x97472Ae141fF13a4d317328Bc4F3f95172fba8CC", // hook_v2
  "0x54198fF2FcE9B0DF255051d49748fe53A8e428Cc", // hook_v21
  "0x2D0e12fEc42CEa31022C37e9D714db6d2d49a8Cc", // hook_v22
];

// Quoted-curve hooks grouped by quote token — fee is denominated in that token.
// Derived from pmav_manifest → curve_markets array (quote address → hooks[]).
const QUOTED_CURVE_MARKETS: Array<{ quoteToken: string; hooks: string[] }> = [
  { quoteToken: USDG, hooks: ["0xd256ea9eddf0338b95891eed8f6daeda15bba8cc", "0x4f3a0413184e8941630de3284746ea8534c7a8cc"] },
  { quoteToken: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", hooks: ["0x462d7841930911224e083ec60c53c6731293a8cc", "0x681f27e579199c22a7cfd5b5d9370f40e29fe8cc"] }, // NVDA
  { quoteToken: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", hooks: ["0x41f3ae2a6d6717243abe6c22bf45dbb9506428cc", "0xf8dfee24f4dda084dbf9ae20cd6d362aef1ea8cc"] }, // TSLA
  { quoteToken: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", hooks: ["0x132da4cde14736339889a5f0016ed1c35658a8cc", "0xb6d34fabc6dae44af72fbce7fcfbf57f0b5428cc"] }, // AAPL
  { quoteToken: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea", hooks: ["0x317417048b659cc22793fcd29f34c92edca028cc", "0xc250b60332da38ad27ed05cc3db9f6e264f5e8cc"] }, // SPCX
  { quoteToken: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35", hooks: ["0x5dacb5f751f3257ab17a99a3cfa39b4c4f5fa8cc", "0x84a7bdc4cbca6e2b93968c4f247c56ce94c428cc"] }, // META
  { quoteToken: "0x12f190a9f9d7d37a250758b26824b97ce941bf54", hooks: ["0xb3b6521ecea00ef37c4feaccf297ce262fc8e8cc", "0xe03185d54600285bd9ff8dde5a7ca503f03d68cc"] }, // AMZN
  { quoteToken: "0x1b0e319c6a659f002271b69db8a7df2f911c153e", hooks: ["0x1021b3f6be038ac21f211d91f4ccbf885a6028cc"] }, // GME
  { quoteToken: "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f", hooks: ["0x24f90d176cdb7f288d4390083dfaa41d6ff968cc"] }, // SLV
  { quoteToken: "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344", hooks: ["0xe9dde136307c0b8ad8a22cf54f46870463c1a8cc"] }, // USO
  { quoteToken: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", hooks: ["0x577ab1262e3440f7f273517d2df569ca4686e8cc"] }, // SPY
  { quoteToken: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", hooks: ["0x9e054b50f0a77183b564eb55ea2ea9d8e57868cc"] }, // PLTR
  { quoteToken: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", hooks: ["0xade82f80e09814ea0f83700c460faafabff368cc"] }, // GOOGL
  { quoteToken: "0x6330d8c3178a418788df01a47479c0ce7ccf450b", hooks: ["0x548f0b88cf02f548448c557d91ee5d93205b68cc"] }, // COIN
  { quoteToken: "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc", hooks: ["0x26e2f03583d2b54488349bb65a6b4fbe3e52a8cc"] }, // AMD
  { quoteToken: "0xb90a19ff0af67f7779aff50a882a9cff42446400", hooks: ["0x9b084d05c554b09243f1425fb62cf167550328cc"] }, // SNDK
  { quoteToken: "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2", hooks: ["0x984d9460abc7d5ec4e9b135360eff2efbb3ca8cc"] }, // COST
  { quoteToken: "0x05b37fb53a299a1b874a619e1c4c404d52c36f4c", hooks: ["0x135fe35b21975e95527408f22c1e1e5028b9e8cc"] }, // RDDT
];

// quote token lookup
const HOOK_TO_QUOTE: Record<string, string> = {};
for (const { quoteToken, hooks } of QUOTED_CURVE_MARKETS) {
  for (const h of hooks) HOOK_TO_QUOTE[h.toLowerCase()] = quoteToken;
}

const ALL_QUOTED_HOOKS = QUOTED_CURVE_MARKETS.flatMap(({ hooks }) => hooks);

const ETH_HOOK_SET = new Set(ETH_HOOKS.map((h) => h.toLowerCase()));

function accumulateLogs(logs: any[], token: string, dailyFees: any, dailyRevenue: any, dailySupplySideRevenue: any, dailyVolume: any) {
  for (const log of logs) {
    const gross = BigInt(log.ethGross);
    const fee = gross - BigInt(log.ethNet);
    dailyVolume.add(token, gross);
    if (fee <= 0n) continue;
    const creatorFee = (fee * CREATOR_SHARE_BPS) / BPS;
    const platformFee = fee - creatorFee;
    dailyFees.add(token, fee, METRIC.SWAP_FEES);
    dailyRevenue.add(token, platformFee, "Swap Fees to Platform");
    dailySupplySideRevenue.add(token, creatorFee, "Swap Fees to Creators");
  }
}

function accumulateGraduatedFees(logs: any[], token: string, dailyFees: any, dailyRevenue: any, dailySupplySideRevenue: any) {
  for (const log of logs) {
    const creatorWei = BigInt(log.creatorWei);
    const platformWei = BigInt(log.platformWei);
    const totalFee = creatorWei + platformWei;
    if (totalFee <= 0n) continue;
    dailyFees.add(token, totalFee, "Graduated Pool Fees");
    dailyRevenue.add(token, platformWei, "Graduated Pool Fees to Platform");
    dailySupplySideRevenue.add(token, creatorWei, "Graduated Pool Fees to Creators");
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  // Two getLogs calls total: one for Trade, one for PoolFeesCollected.
  const [tradeLogs, gradLogs] = await Promise.all([
    options.getLogs({ targets: [...ETH_HOOKS, ...ALL_QUOTED_HOOKS], eventAbi: TRADE_EVENT, entireLog: true }),
    options.getLogs({ targets: [...ETH_HOOKS, ...ALL_QUOTED_HOOKS], eventAbi: POOL_FEES_COLLECTED_EVENT, entireLog: true }),
  ]);

  for (const log of tradeLogs) {
    const addr = log.address?.toLowerCase();
    const token = ETH_HOOK_SET.has(addr) ? WETH : HOOK_TO_QUOTE[addr];
    if (!token) continue;
    accumulateLogs([log.args], token, dailyFees, dailyRevenue, dailySupplySideRevenue, dailyVolume);
  }

  for (const log of gradLogs) {
    const addr = log.address?.toLowerCase();
    const token = ETH_HOOK_SET.has(addr) ? WETH : HOOK_TO_QUOTE[addr];
    if (!token) continue;
    accumulateGraduatedFees([log.args], token, dailyFees, dailyRevenue, dailySupplySideRevenue);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Gross quote-currency value of every trade (ethGross from the Trade event), covering ETH, USDG, and tokenized-stock curves.",
  Fees: "Total 1% swap fees across all pmav pools on ETH, USDG, and tokenized-stock curves, plus LP fees collected from permanently locked graduated pool positions.",
  UserFees: "Users pay a 1% flat fee on every trade in pmav-launched Uniswap v4 pools.",
  Revenue: "Platform's 30% share of swap fees (0.3% per trade).",
  ProtocolRevenue: "Platform's 30% share of swap fees (0.3% per trade).",
  SupplySideRevenue: "Creators' 70% share of swap fees (0.7% per trade).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1% fee on every swap across ETH-curve and quoted-curve (USDG, stocks) pools.",
    "Graduated Pool Fees": "Quote-token fees collected from the permanently locked full range Uniswap v4 position created at graduation.",
  },
  Revenue: {
    "Swap Fees to Platform": "30% of every swap fee sent to the pmav platform.",
    "Graduated Pool Fees to Platform": "Platform's share of fees collected from permanently locked graduated pool positions.",
  },
  ProtocolRevenue: {
    "Swap Fees to Platform": "30% of every swap fee sent to the pmav platform.",
    "Graduated Pool Fees to Platform": "Platform's share of fees collected from permanently locked graduated pool positions.",
  },
  SupplySideRevenue: {
    "Swap Fees to Creators": "70% of every swap fee earned by the token creator, forever.",
    "Graduated Pool Fees to Creators": "Creator's share of fees collected from permanently locked graduated pool positions.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-16",
  fetch,
  methodology,
  breakdownMethodology,
  doublecounted: true, // pools are Uniswap v4
};

export default adapter;
