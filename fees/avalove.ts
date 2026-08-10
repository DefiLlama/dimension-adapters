// AvaLove — Fees & Revenue (dimension-adapters, version 2)
// Path in repo: fees/avalove.ts
//
// Fee model (on-chain, per game pool, both chains):
//   PlatformFeeCollected(uint256 amount) -> protocol revenue (treasury)
//   CreatorFeeCollected(uint256 amount)  -> paid to the pool creator (supply side)
// Each pool denominates fees in its own token; amounts are bucketed under that
// token so DefiLlama prices them. Pools are enumerated from the V3 factories.
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FACTORIES: Record<string, string[]> = {
  [CHAIN.AVAX]: [
    "0x001AfbeEdd4524f46f697356E19c83136f67DB9E", // roulette
    "0x607c3E9AA1F1d3BDB1AC4F1E142d2b14Fd9542be", // slots
    "0xF84ee9817099051078018A45aDc2ca9e7410E4c1", // crash
    "0x4a600d2e1ad60d17E25177D6Ff50a2a7053f785c", // plinko
    "0xCaBb7d93f9b283BC519C095a9ad64261FEFBcc12", // mines
    "0x79AFa26dE82c6e7FA2E3D044BeE717071ff8D826", // dice / range
    "0xd82330003a3d9B687a744bd666663E64CE02073E", // wheel
    "0x188Fb9E83D6B103a6A94875Fc2A60CA9bbc3d4d1", // coinflip
    "0xc1bc22A08fDCd9e78Add8BB361bcC01C3588F6b1", // blackjack
    "0x76D987CFae6b8751c3a5ae16f046E098694ba9C9", // boxes
    "0x96e3136E7a77aE1f5714d599553a4D16116A12db", // pvp / head ball
    "0xcAf8336b4B39da78fEfb709C18cdD1b8C0844625", // chess
  ],
  [CHAIN.ROBINHOOD]: [
    "0x44879d592851CD23853FA9802e01738E09b742eB", // roulette
    "0x37B46a6c3ED48bb7024Aa5Ad263C9b09d5c5e14b", // crash
    "0xC7632E38D3eeed5b057D984132F48A258c981DB0", // blackjack
    "0xB9409da5E0B3E290FA3482f439a9791aEA13DA57", // coinflip
    "0x9AB72Fc99C13b02c7453378AEA431D9589A54F4B", // plinko
    "0x1548b370F7b09314A8cDEEf0fA030B2BF1cF22f1", // dice
    "0x67BA9345D8e829034dd2341F3a95bEbBa4692718", // wheel
    "0x17D937E32ae4014dC53AACA1E7d7e1a4Db205D87", // mines
    "0xe9e1967C2943b45c46Ba62538C9fA8C492CFEFB0", // slots
    "0x842A87aed27d7449d8725480EFa0462557239C6E", // boxes
  ],
};

const TOTAL_GAMES_ABI = "function getTotalGames() view returns (uint256)";
const GET_GAMES_ABI =
  "function getGames(uint256 start, uint256 end) view returns ((address gameAddress, address owner, address creator, address token, string tokenLogoUrl, string betName, uint256 createdAt)[])";
const PLATFORM_FEE_EVENT = "event PlatformFeeCollected(uint256 amount)";
const CREATOR_FEE_EVENT = "event CreatorFeeCollected(uint256 amount)";

const PAGE = 1000;

async function enumeratePools(api: FetchOptions["api"]): Promise<{ pool: string; token: string }[]> {
  const factories = FACTORIES[api.chain] || [];
  if (!factories.length) return [];
  const totals: any[] = await api.multiCall({ abi: TOTAL_GAMES_ABI, calls: factories });
  const calls: { target: string; params: [number, number] }[] = [];
  factories.forEach((target, i) => {
    const n = Number(totals[i] || 0);
    for (let start = 0; start < n; start += PAGE) calls.push({ target, params: [start, Math.min(start + PAGE, n)] });
  });
  if (!calls.length) return [];
  const pages: any[] = await api.multiCall({ abi: GET_GAMES_ABI, calls });
  const pools: { pool: string; token: string }[] = [];
  for (const page of pages) for (const g of page || []) {
    if (g?.gameAddress && g?.token) pools.push({ pool: g.gameAddress, token: g.token });
  }
  return pools;
}

const fetch = async ({ createBalances, getLogs, api }: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const pools = await enumeratePools(api);
  if (!pools.length) return { dailyFees, dailyRevenue };
  const targets = pools.map((p) => p.pool);
  const tokenByIndex = pools.map((p) => p.token);

  const [platformLogs, creatorLogs] = await Promise.all([
    getLogs({ targets, eventAbi: PLATFORM_FEE_EVENT, flatten: false }),
    getLogs({ targets, eventAbi: CREATOR_FEE_EVENT, flatten: false }),
  ]);

  (platformLogs as any[]).forEach((logs: any[], i: number) => {
    for (const log of logs || []) {
      dailyFees.add(tokenByIndex[i], log.amount);
      dailyRevenue.add(tokenByIndex[i], log.amount);
    }
  });
  (creatorLogs as any[]).forEach((logs: any[], i: number) => {
    for (const log of logs || []) {
      dailyFees.add(tokenByIndex[i], log.amount);
      dailySupplySideRevenue.add(tokenByIndex[i], log.amount);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "All betting fees paid across AvaLove game pools = platform fee + creator fee (PlatformFeeCollected + CreatorFeeCollected events, per pool token).",
  Revenue: "Platform's share of fees (PlatformFeeCollected) — accrues to the AvaLove treasury.",
  ProtocolRevenue: "Same as Revenue — all platform fees go to the protocol treasury.",
  SupplySideRevenue: "Creator fees (CreatorFeeCollected) paid out to each pool's creator.",
};

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.AVAX]: { fetch, start: "2025-01-01" },
    [CHAIN.ROBINHOOD]: { fetch, start: "2025-04-01" },
  },
};

export default adapter;
