import { ChainApi } from '@defillama/sdk';
import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions } from '../../adapters/types';
import { getConfig } from '../../helpers/cache';

// Vaults that replaced V7 (the audited release, live 2026-10-23), one per pool on Uniswap V3, Uniswap V4, Up or Ramses.
// Each is deployed directly by the TickerSpring admin wallet (no factory), so the list comes from the TickerSpring API;
// every amount is read on-chain. Same list as the TVL adapter (DefiLlama-Adapters projects/tickerspring-vaults).
const VAULTS_API = 'https://api.tickerspring.com/v1/merged/vaults';

type Kind = 'v3' | 'v4' | 'up' | 'ramses';
type Listed = { vault: string; kind: Kind };

const V4_STATE_VIEW = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b';
// positions() and ticks() are read as raw words. Uniswap V3 and Up (Slipstream) positions: 12 words (liquidity 7,
// feeGrowthInside0/1LastX128 8-9, tokensOwed0/1 10-11); Ramses: 10 (5, 6-7, 8-9). Uniswap V3 and Ramses ticks: 8 words
// (feeGrowthOutside0/1X128 2-3); Up: 10 (3-4).
const NPM_LAYOUT = {
  v3: { manager: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3', positions: 12, liquidity: 7, inside: 8, owed: 10, ticks: 8, outside: 2 },
  up: { manager: '0x07F44c47743A2f36414A82b9F558ECFCf0EEdCEf', positions: 12, liquidity: 7, inside: 8, owed: 10, ticks: 10, outside: 3 },
  ramses: { manager: '0x2eBd7B85a4E08D5B508b04BA147976C94afE6590', positions: 10, liquidity: 5, inside: 6, owed: 8, ticks: 8, outside: 2 },
};

const abi = {
  // Gross trading fees (USDG, pool token) and reward tokens the vault collected from its venue
  harvest: 'event Harvest(uint256 usdgFees, uint256 tokenFees, uint256 rewards)',
  // Full signatures, not 'address:' shorthands: the SDK caches those per contract across blocks, and these two answers
  // depend on the block (no code before the vault's deployment; blockedToken set during a recovery)
  venue: 'function venue() view returns (address)',
  blockedToken: 'function blockedToken() view returns (address)',
  config: 'function config() view returns (address keeper, address guardian, address treasury, address buyback, uint16 protocolFeeBps, uint16 buybackFeeBps, uint16 maxLossBps, uint16 maxDailyLossBps, uint16 maxSlippageBps, uint32 cooldown, int24 minWidth, int24 maxWidth, uint256 depositCap)',
  position: 'function position() view returns (int24 tickLower, int24 tickUpper, uint128 liquidity)',
  spot: 'function spot() view returns (uint160 sqrtPriceX96, int24 tick)',
  poolId: 'function poolId() view returns (bytes32)',
  stakedContains: 'function stakedContains(address depositor, uint256 tokenId) view returns (bool)',
  getPositionInfo: 'function getPositionInfo(bytes32 poolId, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)',
  getFeeGrowthInside: 'function getFeeGrowthInside(bytes32 poolId, int24 tickLower, int24 tickUpper) view returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128)',
};

const Q128 = 2n ** 128n;
const WORD = 2n ** 256n;
const ZERO_SALT = '0x' + '00'.repeat(32);
const wrap = (x: bigint) => ((x % WORD) + WORD) % WORD;

// Tick.getFeeGrowthInside (Uniswap V3, Up and Ramses alike), modulo 2^256
function feeGrowthInside(tick: number, lower: number, upper: number, global: bigint, outsideLower: bigint, outsideUpper: bigint) {
  const below = tick >= lower ? outsideLower : wrap(global - outsideLower);
  const above = tick < upper ? outsideUpper : wrap(global - outsideUpper);
  return wrap(global - below - above);
}

// What collecting would pay now: tokensOwed plus liquidity times the fee growth since the position's last snapshot
const owedFees = (liquidity: bigint, inside: bigint, insideLast: bigint, tokensOwed = 0n) =>
  tokensOwed + liquidity * wrap(inside - insideLast) / Q128;

/** Each vault's trading fees not yet collected at the api's block, in pool order: zero before the vault exists, with
 *  no position, in recovery, or for a staked Up NFT. */
async function uncollectedFees(api: ChainApi, vaults: Listed[]): Promise<[bigint, bigint][]> {
  const result: [bigint, bigint][] = vaults.map(() => [0n, 0n]);
  const venues = await api.multiCall({ abi: abi.venue, calls: vaults.map(v => v.vault), permitFailure: true });
  const live = vaults.map((v, i) => ({ ...v, i, venue: venues[i] as string })).filter(v => v.venue);
  const [blocked, positions] = await Promise.all([
    api.multiCall({ abi: abi.blockedToken, calls: live.map(v => v.vault) }),
    api.multiCall({ abi: abi.position, calls: live.map(v => v.venue) }),
  ]);
  // In recovery the vault harvests nothing more: the blocked token's amounts belong to the recovery
  const open = live.map((v, j) => ({ ...v, position: positions[j] })).filter((_, j) => blocked[j] === ADDRESSES.null);

  // Uniswap V4: the venue's PoolManager position (owner the venue, salt 0)
  const v4 = open.filter(v => v.kind === 'v4' && BigInt(v.position.liquidity) > 0n);
  const poolIds = await api.multiCall({ abi: abi.poolId, calls: v4.map(v => v.venue) });
  const [infos, insides] = await Promise.all([
    api.multiCall({ abi: abi.getPositionInfo, target: V4_STATE_VIEW, calls: v4.map((v, j) => ({ params: [poolIds[j], v.venue, v.position.tickLower, v.position.tickUpper, ZERO_SALT] })) }),
    api.multiCall({ abi: abi.getFeeGrowthInside, target: V4_STATE_VIEW, calls: v4.map((v, j) => ({ params: [poolIds[j], v.position.tickLower, v.position.tickUpper] })) }),
  ]);
  v4.forEach((v, j) => {
    const liquidity = BigInt(infos[j].liquidity);
    result[v.i] = [
      owedFees(liquidity, BigInt(insides[j].feeGrowthInside0X128), BigInt(infos[j].feeGrowthInside0LastX128)),
      owedFees(liquidity, BigInt(insides[j].feeGrowthInside1X128), BigInt(infos[j].feeGrowthInside1LastX128)),
    ];
  });

  // Uniswap V3, Up and Ramses: the venue's position NFT
  const npm = open.filter(v => v.kind !== 'v4');
  const [tokenIds, pools, spots] = await Promise.all([
    api.multiCall({ abi: 'uint256:tokenId', calls: npm.map(v => v.venue) }),
    api.multiCall({ abi: 'address:pool', calls: npm.map(v => v.venue) }),
    api.multiCall({ abi: abi.spot, calls: npm.map(v => v.venue) }),
  ]);
  const minted = npm.map((v, j) => ({ ...v, tokenId: tokenIds[j], pool: pools[j], tick: Number(spots[j].tick) })).filter(v => BigInt(v.tokenId) > 0n);
  // A staked Up NFT earns no trading fees (the gauge takes them); its UP emissions are not fees
  const up = minted.filter(v => v.kind === 'up');
  const gauges = await api.multiCall({ abi: 'address:gauge', calls: up.map(v => v.venue) });
  const staked = await api.multiCall({ abi: abi.stakedContains, calls: up.map((v, j) => ({ target: gauges[j], params: [v.venue, v.tokenId] })) });
  const earning = minted.filter(v => v.kind !== 'up' || !staked[up.indexOf(v)]);
  // Ramses' gauge can also pay pool-token rewards, which a harvest claims; they are counted when claimed, not here
  for (const kind of ['v3', 'up', 'ramses'] as const) {
    const group = earning.filter(v => v.kind === kind);
    if (!group.length) continue;
    const layout = NPM_LAYOUT[kind];
    const [nfts, lowers, uppers, globals0, globals1] = await Promise.all([
      api.multiCall({ abi: `function positions(uint256) view returns (uint256[${layout.positions}])`, target: layout.manager, calls: group.map(v => v.tokenId) }),
      api.multiCall({ abi: `function ticks(int24) view returns (uint256[${layout.ticks}])`, calls: group.map(v => ({ target: v.pool, params: [v.position.tickLower] })) }),
      api.multiCall({ abi: `function ticks(int24) view returns (uint256[${layout.ticks}])`, calls: group.map(v => ({ target: v.pool, params: [v.position.tickUpper] })) }),
      api.multiCall({ abi: 'uint256:feeGrowthGlobal0X128', calls: group.map(v => v.pool) }),
      api.multiCall({ abi: 'uint256:feeGrowthGlobal1X128', calls: group.map(v => v.pool) }),
    ]);
    group.forEach((v, j) => {
      const nft = nfts[j].map(BigInt), lower = lowers[j].map(BigInt), upper = uppers[j].map(BigInt);
      const globals = [BigInt(globals0[j]), BigInt(globals1[j])];
      const [tickLower, tickUpper] = [Number(v.position.tickLower), Number(v.position.tickUpper)];
      const owed = [0, 1].map(k => owedFees(nft[layout.liquidity],
        feeGrowthInside(v.tick, tickLower, tickUpper, globals[k], lower[layout.outside + k], upper[layout.outside + k]),
        nft[layout.inside + k], nft[layout.owed + k]));
      result[v.i] = [owed[0], owed[1]];
    });
  }
  return result;
}

export type VaultFee = { token: string; earned: bigint; operations: bigint; buyback: bigint };

/** Trading fees the vaults earned in the window, per token: collected (Harvest) plus the change in fees not yet
 *  collected, split by each vault's protocol and buyback fee shares. */
export async function vaultFees(options: FetchOptions): Promise<VaultFee[]> {
  const { data } = await getConfig('tickerspring-vaults', VAULTS_API);
  const listed: Listed[] = data.vaults.map((v: any) => ({ vault: v.vault, kind: v.kind }));
  // Only vaults that exist at the window's end
  const venues = await options.toApi.multiCall({ abi: abi.venue, calls: listed.map(v => v.vault), permitFailure: true });
  const vaults = listed.filter((_, i) => venues[i]);
  if (!vaults.length) return [];
  const [opening, closing, harvests, usdgs, tokens, token0s, configs] = await Promise.all([
    uncollectedFees(options.fromApi, vaults),
    uncollectedFees(options.toApi, vaults),
    options.getLogs({ targets: vaults.map(v => v.vault), eventAbi: abi.harvest, flatten: false }),
    options.toApi.multiCall({ abi: 'address:usdg', calls: vaults.map(v => v.vault) }),
    options.toApi.multiCall({ abi: 'address:token', calls: vaults.map(v => v.vault) }),
    options.toApi.multiCall({ abi: 'address:token0', calls: venues.filter(Boolean) }),
    options.toApi.multiCall({ abi: abi.config, calls: vaults.map(v => v.vault) }),
  ]);
  return vaults.flatMap((_, i) => {
    const harvested = [0n, 0n];
    harvests[i].forEach((log: any) => {
      harvested[0] += BigInt(log.usdgFees);
      harvested[1] += BigInt(log.tokenFees);
    });
    // Pool order to (USDG, pool token)
    const usdgIsToken0 = token0s[i].toLowerCase() === usdgs[i].toLowerCase();
    const [before, after] = [opening[i], closing[i]].map(([a, b]) => usdgIsToken0 ? [a, b] : [b, a]);
    return [usdgs[i], tokens[i]].map((token, side) => {
      // Only a recovery (an issuer froze a token) drops uncollected fees without a harvest; those fees are never collected
      const earned = harvested[side] + after[side] - before[side];
      const fee = earned > 0n ? earned : 0n;
      return {
        token,
        earned: fee,
        operations: fee * BigInt(configs[i].protocolFeeBps) / 10_000n,
        buyback: fee * BigInt(configs[i].buybackFeeBps) / 10_000n,
      };
    });
  });
}
