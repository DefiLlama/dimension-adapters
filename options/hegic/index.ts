import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { ethers } from "ethers";

// Hegic Herge launch on Arbitrum.
export const HEGIC_HERGE_START = "2022-10-25";

// Hegic Herge core contracts (Arbitrum).
const OPERATIONAL_TREASURY = "0xec096ea6eB9aa5ea689b0CF00882366E92377371";
const POSITIONS_MANAGER = "0x5fe380d68fee022d8acd42dc4d36fbfb249a76d5";
export const USDCE = ADDRESSES.arbitrum.USDC; // settlement token: USDC.e (6dp)

// priceProvider() feed -> underlying decimals (for strategyData.amount).
const SPOT_DECIMALS: Record<string, number> = {
  "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612": 1e18, // ETH/USD -> ETH (18dp)
  "0x6ce185860a4963106506c203335a2910413708e9": 1e8, // BTC/USD -> BTC (8dp)
};
const PRICE_DECIMALS = 1e8; // Chainlink feed / strike decimals

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ERC721_TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)";
const PAID_EVENT = "event Paid(uint256 indexed id, address indexed account, uint256 amount)";

const lockedLiquidityAbi =
  "function lockedLiquidity(uint256) view returns (uint8 state, address strategy, uint128 negativepnl, uint128 positivepnl, uint32 expiration)";
const strategyDataAbi = "function strategyData(uint256) view returns (uint128 amount, uint128 strike)";
const priceProviderAbi = "function priceProvider() view returns (address)";
const exerciserRoleAbi = "function EXERCISER_ROLE() view returns (bytes32)";

const topicAddress = (address: string) => ethers.zeroPadValue(address, 32);

interface Position {
  id: string;
  strategy: string; // lowercased
  negativepnl: bigint;
  positivepnl: bigint;
  isInverse: boolean;
  premium: bigint; // USDC.e (6dp)
}

// Inverse strategies expose EXERCISER_ROLE(); standard ones revert (null).
async function getInverseStrategies(options: FetchOptions, strategies: string[]): Promise<Set<string>> {
  const unique = [...new Set(strategies.map((s) => s.toLowerCase()))];
  const roles = await options.api.multiCall({
    abi: exerciserRoleAbi,
    calls: unique.map((target) => ({ target })),
    permitFailure: true,
  });
  return new Set(unique.filter((_, i) => roles[i] !== null));
}

// Each option bought mints one NFT. Premium is family-aware:
// standard = positivepnl; inverse = negativepnl (its positivepnl is just collateral).
export async function loadPositions(options: FetchOptions): Promise<Position[]> {
  const mintLogs = await options.getLogs({
    target: POSITIONS_MANAGER,
    eventAbi: ERC721_TRANSFER,
    topics: [TRANSFER_TOPIC, topicAddress(ADDRESSES.null)] as any,
  });
  const ids = mintLogs.map((log: any) => log.tokenId.toString());
  if (!ids.length) return [];

  const locked = await options.api.multiCall({
    abi: lockedLiquidityAbi,
    calls: ids.map((id) => ({ target: OPERATIONAL_TREASURY, params: [id] })),
  });
  const inverseSet = await getInverseStrategies(options, locked.map((l: any) => l[1]));

  return ids.map((id: string, i: number) => {
    const strategy = locked[i][1].toLowerCase();
    const negativepnl = BigInt(locked[i][2]);
    const positivepnl = BigInt(locked[i][3]);
    const isInverse = inverseSet.has(strategy);
    return { id, strategy, negativepnl, positivepnl, isInverse, premium: isInverse ? negativepnl : positivepnl };
  });
}

// Notional = amount * strike (strike is the spot recorded at purchase).
// Standard strategies only; inverse strategyData has no usable notional.
async function addNotional(options: FetchOptions, balances: any, positions: Position[]) {
  const standard = positions.filter((p) => !p.isInverse);
  if (!standard.length) return;

  const strategyData = await options.api.multiCall({
    abi: strategyDataAbi,
    calls: standard.map((p) => ({ target: p.strategy, params: [p.id] })),
  });

  const uniqueStrategies = [...new Set(standard.map((p) => p.strategy))];
  const providers = await options.api.multiCall({
    abi: priceProviderAbi,
    calls: uniqueStrategies.map((target) => ({ target })),
  });
  const spotDecimalsByStrategy: Record<string, number> = {};
  uniqueStrategies.forEach((strategy, i) => {
    const feed = providers[i].toLowerCase();
    const spotDecimals = SPOT_DECIMALS[feed];
    if (!spotDecimals) throw new Error(`Hegic: unknown price feed ${feed} for strategy ${strategy}`);
    spotDecimalsByStrategy[strategy] = spotDecimals;
  });

  standard.forEach((p, i) => {
    const amount = Number(strategyData[i][0]) / spotDecimalsByStrategy[p.strategy];
    const strike = Number(strategyData[i][1]) / PRICE_DECIMALS;
    balances.addUSDValue(amount * strike, "Options notional");
  });
}

// Exercise payoffs to option holders; inverse payoffs (returned collateral) excluded.
export async function getDailyPayoffs(options: FetchOptions) {
  const balances = options.createBalances();
  const paidLogs = await options.getLogs({ target: OPERATIONAL_TREASURY, eventAbi: PAID_EVENT });
  if (!paidLogs.length) return balances;

  const ids = paidLogs.map((log: any) => log.id.toString());
  const locked = await options.api.multiCall({
    abi: lockedLiquidityAbi,
    calls: ids.map((id) => ({ target: OPERATIONAL_TREASURY, params: [id] })),
  });
  const inverseSet = await getInverseStrategies(options, locked.map((l: any) => l[1]));

  paidLogs.forEach((log: any, i: number) => {
    if (inverseSet.has(locked[i][1].toLowerCase())) return;
    balances.add(USDCE, log.amount, "Options payoffs");
  });
  return balances;
}

async function fetch(options: FetchOptions) {
  const positions = await loadPositions(options);

  const dailyPremiumVolume = options.createBalances();
  for (const p of positions) dailyPremiumVolume.add(USDCE, p.premium, "Options premiums");

  const dailyNotionalVolume = options.createBalances();
  await addNotional(options, dailyNotionalVolume, positions);

  return { dailyNotionalVolume, dailyPremiumVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.ARBITRUM],
  fetch,
  start: HEGIC_HERGE_START,
  pullHourly: true,
  methodology: {
    NotionalVolume:
      "Underlying amount of each option/strategy bought that day multiplied by the spot price recorded at purchase. Inverse (option-selling) strategies are excluded as their on-chain data does not map to a notional.",
    PremiumVolume:
      "Premiums paid by users to buy options and strategies that day. For inverse (option-selling) strategies the premium is the option's fair value, not the net collateral transferred.",
  },
  breakdownMethodology: {
    NotionalVolume: {
      "Options notional": "Underlying amount times spot price at purchase for standard (option-buying) strategies.",
    },
    PremiumVolume: {
      "Options premiums": "Option premiums paid by users across all strategies.",
    },
  },
};

export default adapter;
