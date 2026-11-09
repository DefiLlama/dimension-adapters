import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { BASEDBID_SOLANA_PROGRAM, getBasedBidSolanaQuoteMints } from "../../helpers/basedbid";

const ZERO_ADDRESS = ADDRESSES.null;

type DexType = "uniV4" | "pcs";
type ChainConfig = {
  TREASURY_CONTRACT: string;
  CORE_CONTRACT: string;
  // Every BasedBid fee-builder hook generation deployed on the chain. A pool is bound to its
  // hook for life, so superseded generations keep emitting and are never removed.
  // Source: BASEDBID_HOOKS / PCS_CL_BASEDBID_HOOK in the based.bid frontend and the team's
  // "based.bid addresses" ledger.
  HOOK_CONTRACTS: { target: string; dexType: DexType }[];
  // Uniswap v4 PositionManager: poolKeys(bytes25) resolves a pool id to its currencies.
  UNI_V4_POSITION_MANAGER?: string;
  // PancakeSwap Infinity CLPoolManager: poolIdToPoolKey(bytes32) does the same.
  PCS_CL_POOL_MANAGER?: string;
  start: string;
  // Block of the first hook deployment on the chain, where the pool-config scan starts.
  fromBlock: number;
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    TREASURY_CONTRACT: "0x64de97c78f9285C6853F75607E83436eF9698c85",
    CORE_CONTRACT: "0x3cb3D9E659653de02D8e3Aecd4963Ba1Ae429682",
    HOOK_CONTRACTS: [
      { target: "0x4Cfea8C14d159D96ffB8C1B7B425E0Ddda6B50Cc", dexType: "uniV4" },
      { target: "0xe4544f99e39B0d120366814F9C84a6BeAb2350CC", dexType: "uniV4" },
      { target: "0x72ec860218A711E54c7ca5A390c9A625947890Cc", dexType: "uniV4" },
      { target: "0x558C8768a17DdcABbDBdD75A99433609933fDACC", dexType: "uniV4" },
    ],
    UNI_V4_POSITION_MANAGER: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
    start: "2025-11-17",
    fromBlock: 24886453,
  },
  [CHAIN.BSC]: {
    TREASURY_CONTRACT: "0x64de97c78f9285C6853F75607E83436eF9698c85",
    CORE_CONTRACT: "0x920b4Ee4970CFE1ef523a0679200f9d9b2F87B2c",
    HOOK_CONTRACTS: [
      { target: "0x80DAefeFb1FC0942c7aC6CC65766A9bb085990cc", dexType: "uniV4" },
      { target: "0x8E6B0A1B73F8eCf08bBB910c283cb3F4077d50cC", dexType: "uniV4" },
      { target: "0x30f290ce49d4C75a86a2c6d538848693C64750Cc", dexType: "uniV4" },
      { target: "0x6B715008bd41a96A33775D709207724cd7941ACC", dexType: "uniV4" },
      { target: "0x2656eBEEdA763F26fF88BA38CA2BF2b45D39680D", dexType: "pcs" },
      { target: "0x106f144922330D6263cd33d71a9B1603bBa0DCCC", dexType: "pcs" },
      { target: "0xB030d77Cbc0084772084b41799E0CD55120803ef", dexType: "pcs" },
      { target: "0x1bEC4D8BA4511d0E1ab2a042a4bd70832c71Dc78", dexType: "pcs" },
    ],
    UNI_V4_POSITION_MANAGER: "0x7a4a5c919ae2541aed11041a1aeee68f1287f95b",
    PCS_CL_POOL_MANAGER: "0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b",
    start: "2025-11-17",
    fromBlock: 92541430,
  },
  [CHAIN.BASE]: {
    TREASURY_CONTRACT: "0x64de97c78f9285C6853F75607E83436eF9698c85",
    CORE_CONTRACT: "0x0F2C33F406D58144Dec03FCdb69571249F0b0286",
    HOOK_CONTRACTS: [
      { target: "0xea6e57d5FA362C1Fba4F52EE19138a4E79F310CC", dexType: "uniV4" },
      { target: "0x4D667e420bd4a42969cb27251a3f9a24661fD0CC", dexType: "uniV4" },
      { target: "0x1995280EC8cbE8136DAfE96645b24c52dF3590CC", dexType: "uniV4" },
      { target: "0xe990B430082A0E6c5Bd65d793B36ef1645A7D0CC", dexType: "uniV4" },
      { target: "0xe60e2f9BE5dcde3e9c525cfB2A4a6ce9045390cC", dexType: "uniV4" },
      { target: "0x64A5DdDf5170433Fd40e9422eD8DAbabB53d1ACC", dexType: "uniV4" },
      { target: "0x5A77AC7f849b9564FBB4Ac377B2fDCd3E8595AcC", dexType: "uniV4" },
      { target: "0xcB9d09fbA2195Cb59d979dF042FeE667f2B15acc", dexType: "uniV4" },
      { target: "0xf348B9dB6f2Ec379C261f3D11AAeA4C924D5be95", dexType: "pcs" },
      { target: "0xFeA466d80bF94D06c63ccA0C555a8c9A114E60db", dexType: "pcs" },
      { target: "0x934Ce79eb5f768602991892a4074DcdC217564A1", dexType: "pcs" },
      { target: "0xF85502cE804063F4c77920ce4269bfcA72F8C8DF", dexType: "pcs" },
      { target: "0x29208acB3cafe03d3c9A17985249E35EEf7b0270", dexType: "pcs" },
    ],
    UNI_V4_POSITION_MANAGER: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
    PCS_CL_POOL_MANAGER: "0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b",
    start: "2025-11-17",
    fromBlock: 44702581,
  },
  [CHAIN.MEGAETH]: {
    TREASURY_CONTRACT: "0x64de97c78f9285C6853F75607E83436eF9698c85",
    CORE_CONTRACT: "0x695e175c9704432cdFB98e3C193966F95a5F119D",
    // No pool was ever configured on this hook and the diamond never registered a v4
    // position manager on MegaETH, so there is no pool-key source to list.
    HOOK_CONTRACTS: [{ target: "0xf35301c240fE5a5eDc59ee660eA0893aEe9aD0cc", dexType: "uniV4" }],
    start: "2026-02-09",
    fromBlock: 7852141,
  },
  [CHAIN.ROBINHOOD]: {
    TREASURY_CONTRACT: "0xbD66B5E936877505A63ce61b09A5059012b34fc3",
    CORE_CONTRACT: "0x6EC95a3C6C7b8368C9bF37Ff664672E55df3550d",
    HOOK_CONTRACTS: [
      { target: "0x2485F30207230128276DA25ca030c77eA3DDD0cc", dexType: "uniV4" },
      { target: "0x73585e6Aa679bC6aF021b9F1d16A7016290A90Cc", dexType: "uniV4" },
      { target: "0x9c274C45083cf90A92e1DFB5041F094c3A8D90Cc", dexType: "uniV4" },
      { target: "0xe3f404b9ADfdCFD444853336dD3a89A8dF6110Cc", dexType: "uniV4" },
      { target: "0x037BF303462Bb3CdE80038a1945CD10af1EBdaCc", dexType: "uniV4" },
      { target: "0x6E0878bd024Eb86F203c154Dab4568ea4ccA3532", dexType: "pcs" },
    ],
    UNI_V4_POSITION_MANAGER: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
    PCS_CL_POOL_MANAGER: "0xeE04c68742e6Bf434bE8039580D2e89BBE55bc6f",
    start: "2026-07-09",
    fromBlock: 4782348,
  },
  // Arc's native coin is USDC (18 decimals); 0x3600...0000 is its 6-decimal ERC20 view.
  // The hooks and the treasury report native shares through that ERC20 and the diamond
  // through the zero address; both are priced as USDC.
  [CHAIN.ARC]: {
    TREASURY_CONTRACT: "0x346d7aC9139aCDCC6d0Ad882E3c81dc23360adDd",
    CORE_CONTRACT: "0x50C5939990CE22C5CF967cAB42a488eEa11945cB",
    HOOK_CONTRACTS: [
      { target: "0x2fF97FD4A58C653aAdE8F968e98DE577B8D65acC", dexType: "uniV4" },
      { target: "0x5436513A25c5fE04BB7c1f16Bc6a6AA988835AcC", dexType: "uniV4" },
      { target: "0x0BE4c82F9B4791076aAEcA04996dB454747A1aCC", dexType: "uniV4" },
    ],
    UNI_V4_POSITION_MANAGER: "0x6049c9a0e26405c0985f9e3685c87d0ae917f82b",
    start: "2026-09-04",
    fromBlock: 19181092,
  },
}

// Solana: the BasedBid program transfers the protocol's share of creation/trading/
// finalize/LP-claim fees to the hardcoded admin fee wallet, in the quote token of the
// project that generated them (any token a registered project launched against). The wallet
// also collects fees for other products of the team, so inflows are restricted to
// transactions that include the BasedBid program.
//
// Only the protocol fee share is counted. The sub-board, meme-owner and referral fee
// shares are paid directly to per-token wallets configured at token creation; they
// cannot be isolated from transfer data alone (a trade also contains the principal leg
// and temporary WSOL account funding, either of which can exceed the fee legs), and
// there is no decoded model for this program to read the split from. Solana fees are
// therefore a conservative undercount limited to the protocol share.
const SOLANA_PROGRAM = BASEDBID_SOLANA_PROGRAM;
const SOLANA_FEE_WALLET = "8umVV7k9HoVm4yy5DiRtKSH5qbKtw8xWDARGX8QiLfLe";

const fetchSolana = async (options: FetchOptions) => {
  const feeMints = await getBasedBidSolanaQuoteMints();
  const rows = await queryAllium(`
    WITH program_txs AS (
      SELECT txn_id
      FROM solana.raw.transactions
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND success = true
        AND ARRAY_CONTAINS('${SOLANA_PROGRAM}'::VARIANT, TRANSFORM(account_keys, x -> x:pubkey))
    )
    SELECT COALESCE(SUM(tr.usd_amount), 0) AS daily_fees
    FROM solana.assets.transfers tr
    JOIN program_txs p ON p.txn_id = tr.txn_id
    WHERE tr.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND tr.block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND tr.to_address = '${SOLANA_FEE_WALLET}'
      AND tr.from_address != '${SOLANA_FEE_WALLET}'
      AND tr.mint IN (${feeMints.map((m) => `'${m}'`).join(", ")})
  `);

  const dailyFees = Number(rows[0].daily_fees);
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const METRICS = {
  treasuryRevenue: "Treasury Revenue",
  subBoardFees: "SubBoard Fees",
  memeOwnerFees: "Meme Owner Fees",
  referralFees: "Referral Fees",
  hookLiquidityFees: "Hook Liquidity Fees",
  hookBuybackFees: "Hook Buyback Fees",
  hookRewardFees: "Hook Reward Fees",
  hookCustomWalletFees: "Hook Custom Wallet Fees",
};

const ABI = {
  feeCollected: "event FeeCollected(address token, uint256 amount, address from)",
  subBoardFeeCollected: "event SubBoardFeeCollected(address indexed subBoardOwner, address indexed token, uint256 amount)",
  memeOwnerFeeCollected: "event MemeOwnerFeeCollected(address indexed memeOwner, address indexed token, uint256 amount)",
  referralFeeCollected: "event ReferralFeeCollected(address indexed referrer, address indexed token, uint256 amount)",
  // Hook events below are identical on the Uniswap v4 and PancakeSwap Infinity CL hooks.
  // PoolConfigured has kept one signature through every hook generation.
  poolConfigured:
    "event PoolConfigured(bytes32 indexed poolId, address indexed poolOwner, uint48 launchTimestamp, uint48 whitelistPeriod, bool projectTokenIsCurrency1, uint256 maxBuyPerOrigin)",
  liquidityAdded: "event LiquidityAdded(bytes32 indexed poolId, uint256 liquidity0, uint256 liquidity1)",
  // projectTokenAmount is the project token bought and burned, ETHAmount the quote token spent on it.
  buyback: "event Buyback(bytes32 indexed poolId, uint256 projectTokenAmount, uint256 ETHAmount)",
  // Hooks deployed since July 2026 name the token they paid out.
  rewardDistributed: "event RewardDistributed(bytes32 indexed poolId, address indexed token, uint256 amount)",
  customWalletFeeDistributed:
    "event CustomWalletFeeDistributed(bytes32 indexed poolId, address indexed wallet, address indexed token, uint256 amount)",
  // Earlier hooks emit the amount only; the token follows from the pool (see fetch).
  legacyRewardDistributed: "event RewardDistributed(bytes32 indexed poolId, uint256 amount)",
  legacyCustomWalletFeeDistributed: "event CustomWalletFeeDistributed(bytes32 indexed poolId, address indexed wallet, uint256 amount)",
  uniPoolKeys:
    "function poolKeys(bytes25 poolId) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
  pcsPoolIdToPoolKey:
    "function poolIdToPoolKey(bytes32 id) view returns (address currency0, address currency1, address hooks, address poolManager, uint24 fee, bytes32 parameters)",
  uniRewardSwapPoolKey:
    "function getRewardSwapPoolKey(bytes32 id) view returns(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
  pcsRewardSwapPoolKey:
    "function getRewardSwapPoolKey(bytes32 id) view returns(address currency0, address currency1, address hooks, address poolManager, uint24 fee, bytes32 parameters)",
};

const toAddress = (value: any): string | undefined => {
  if (!value || typeof value !== "string") return undefined;
  return value.toLowerCase();
};

const toBigInt = (value: any): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  return BigInt(0);
};

const addTokenAmount = (balances: any, token: string | undefined, amount: any, label?: string) => {
  if (!token) return;
  const parsedAmount = toBigInt(amount);
  if (parsedAmount === BigInt(0)) return;
  balances.add(token!, parsedAmount, label);
};

const toPoolId = (log: any) => String(log.poolId).toLowerCase();

type PoolMeta = {
  currency0: string;
  currency1: string;
  // The pool's non-project currency: the token the project launched against and the one
  // every hook fee is taken in. Any token, not only the native coin.
  quoteToken?: string;
};

const fetch = async (options: FetchOptions) => {
  const { TREASURY_CONTRACT, CORE_CONTRACT, HOOK_CONTRACTS, UNI_V4_POSITION_MANAGER, PCS_CL_POOL_MANAGER, fromBlock } = chainConfig[options.chain];
  const treasury = TREASURY_CONTRACT;
  const core = CORE_CONTRACT;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const revenueLogs = await options.getLogs({ target: treasury, eventAbi: ABI.feeCollected });
  revenueLogs.forEach((log: any) => {
    const token = toAddress(log.token);
    const amount = log.amount;
    addTokenAmount(dailyRevenue, token, amount, METRICS.treasuryRevenue);
    addTokenAmount(dailyProtocolRevenue, token, amount, METRICS.treasuryRevenue);
  });

  const subBoardFeeLogs = await options.getLogs({ target: core, eventAbi: ABI.subBoardFeeCollected });
  const memeOwnerFeeLogs = await options.getLogs({ target: core, eventAbi: ABI.memeOwnerFeeCollected });
  const referralFeeLogs = await options.getLogs({ target: core, eventAbi: ABI.referralFeeCollected });

  subBoardFeeLogs.forEach((log: any) =>{
    addTokenAmount(dailyFees, toAddress(log.token), log.amount, METRICS.subBoardFees),
    addTokenAmount(dailySupplySideRevenue, toAddress(log.token), log.amount, METRICS.subBoardFees)
  });
  memeOwnerFeeLogs.forEach((log: any) =>{
    addTokenAmount(dailyFees, toAddress(log.token), log.amount, METRICS.memeOwnerFees),
    addTokenAmount(dailySupplySideRevenue, toAddress(log.token), log.amount, METRICS.memeOwnerFees)
  });
  referralFeeLogs.forEach((log: any) =>{
    addTokenAmount(dailyFees, toAddress(log.token), log.amount, METRICS.referralFees),
    addTokenAmount(dailySupplySideRevenue, toAddress(log.token), log.amount, METRICS.referralFees)
  });

  const hookTargets = HOOK_CONTRACTS.map((hook) => hook.target);
  const liquidityAddedLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.liquidityAdded, flatten: false });
  const buybackLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.buyback, flatten: false });
  const rewardDistributedLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.rewardDistributed, flatten: false });
  const customWalletFeeDistributedLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.customWalletFeeDistributed, flatten: false });
  const legacyRewardDistributedLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.legacyRewardDistributed, flatten: false });
  const legacyCustomWalletFeeDistributedLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.legacyCustomWalletFeeDistributed, flatten: false });
  const hookEventLogs = HOOK_CONTRACTS.map((hook, i) => ({
    ...hook,
    liquidityAdded: liquidityAddedLogs[i] ?? [],
    buyback: buybackLogs[i] ?? [],
    rewardDistributed: rewardDistributedLogs[i] ?? [],
    customWalletFeeDistributed: customWalletFeeDistributedLogs[i] ?? [],
    legacyRewardDistributed: legacyRewardDistributedLogs[i] ?? [],
    legacyCustomWalletFeeDistributed: legacyCustomWalletFeeDistributedLogs[i] ?? [],
  }));

  // Events that carry a bare amount need the pool's currencies. They are read from the DEX
  // itself for the pools that emitted in the period, so every pool on a BasedBid hook is
  // covered whatever token it is quoted in.
  const poolCalls: { poolId: string; dexType: DexType }[] = [];
  const seenPools = new Set<string>();
  hookEventLogs.forEach(({ dexType, liquidityAdded, buyback, legacyRewardDistributed, legacyCustomWalletFeeDistributed }) => {
    [...liquidityAdded, ...buyback, ...legacyRewardDistributed, ...legacyCustomWalletFeeDistributed].forEach((log: any) => {
      const poolId = toPoolId(log);
      if (seenPools.has(poolId)) return;
      seenPools.add(poolId);
      poolCalls.push({ poolId, dexType });
    });
  });

  const poolMeta: Record<string, PoolMeta> = {};
  const addPoolKeys = (calls: { poolId: string }[], keys: any[]) => {
    calls.forEach(({ poolId }, i) => {
      const currency0 = toAddress(keys[i].currency0)!;
      const currency1 = toAddress(keys[i].currency1)!;
      // An empty key means the pool was never registered with this manager (liquidity added
      // through third-party periphery); its amounts cannot be tied to a token and are left out.
      if (currency0 === ZERO_ADDRESS && currency1 === ZERO_ADDRESS) return;
      poolMeta[poolId] = { currency0, currency1 };
    });
  };
  const uniPoolCalls = poolCalls.filter(({ dexType }) => dexType === "uniV4");
  if (uniPoolCalls.length) {
    if (!UNI_V4_POSITION_MANAGER) throw new Error(`basedbid: no Uniswap v4 position manager configured on ${options.chain}`);
    const keys = await options.api.multiCall({
      abi: ABI.uniPoolKeys,
      // The PositionManager indexes pool keys by the first 25 bytes of the pool id.
      calls: uniPoolCalls.map(({ poolId }) => ({ target: UNI_V4_POSITION_MANAGER, params: [poolId.slice(0, 52)] })),
    });
    addPoolKeys(uniPoolCalls, keys);
  }
  const pcsPoolCalls = poolCalls.filter(({ dexType }) => dexType === "pcs");
  if (pcsPoolCalls.length) {
    if (!PCS_CL_POOL_MANAGER) throw new Error(`basedbid: no PancakeSwap Infinity CL pool manager configured on ${options.chain}`);
    const keys = await options.api.multiCall({
      abi: ABI.pcsPoolIdToPoolKey,
      calls: pcsPoolCalls.map(({ poolId }) => ({ target: PCS_CL_POOL_MANAGER, params: [poolId] })),
    });
    addPoolKeys(pcsPoolCalls, keys);
  }

  // Which side of the pool is the project token is set by the hook's pool configuration.
  // The later event wins: the side can be changed after launch. Only buybacks and the
  // legacy bare-amount events need it, so the scan is skipped when the period has none.
  const needsQuoteToken = hookEventLogs.some(({ buyback, legacyRewardDistributed, legacyCustomWalletFeeDistributed }) =>
    buyback.length + legacyRewardDistributed.length + legacyCustomWalletFeeDistributed.length > 0);
  if (needsQuoteToken) {
    const poolConfiguredLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.poolConfigured, fromBlock, cacheInCloud: true });
    poolConfiguredLogs.forEach((log: any) => {
      const meta = poolMeta[toPoolId(log)];
      if (meta) meta.quoteToken = log.projectTokenIsCurrency1 ? meta.currency0 : meta.currency1;
    });
  }

  // Legacy hooks pay rewards in the quote token unless the pool has a reward swap pool,
  // in which case the quote token is swapped through it into that pool's other currency.
  const rewardPoolCalls = hookEventLogs.flatMap(({ target, dexType, legacyRewardDistributed }) =>
    [...new Set<string>(legacyRewardDistributed.map(toPoolId))].map((poolId) => ({ target, dexType, poolId })),
  );
  const legacyRewardToken: Record<string, string | undefined> = {};
  const addRewardTokens = (calls: { poolId: string }[], keys: any[]) => {
    calls.forEach(({ poolId }, i) => {
      const meta = poolMeta[poolId];
      if (!meta?.quoteToken) return;
      const currency0 = toAddress(keys[i].currency0)!;
      const currency1 = toAddress(keys[i].currency1)!;
      const isUnset = currency0 === ZERO_ADDRESS && currency1 === ZERO_ADDRESS;
      const isOwnPool = currency0 === meta.currency0 && currency1 === meta.currency1;
      if (isUnset || isOwnPool) legacyRewardToken[poolId] = meta.quoteToken;
      else legacyRewardToken[poolId] = meta.quoteToken === currency0 ? currency1 : currency0;
    });
  };
  const uniRewardPoolCalls = rewardPoolCalls.filter(({ dexType }) => dexType === "uniV4");
  if (uniRewardPoolCalls.length) {
    const keys = await options.api.multiCall({
      abi: ABI.uniRewardSwapPoolKey,
      calls: uniRewardPoolCalls.map(({ target, poolId }) => ({ target, params: [poolId] })),
    });
    addRewardTokens(uniRewardPoolCalls, keys);
  }
  const pcsRewardPoolCalls = rewardPoolCalls.filter(({ dexType }) => dexType === "pcs");
  if (pcsRewardPoolCalls.length) {
    const keys = await options.api.multiCall({
      abi: ABI.pcsRewardSwapPoolKey,
      calls: pcsRewardPoolCalls.map(({ target, poolId }) => ({ target, params: [poolId] })),
    });
    addRewardTokens(pcsRewardPoolCalls, keys);
  }

  const addHookFee = (token: string | undefined, amount: any, label: string) => {
    addTokenAmount(dailyFees, token, amount, label);
    addTokenAmount(dailySupplySideRevenue, token, amount, label);
  };

  hookEventLogs.forEach(({ liquidityAdded, buyback, rewardDistributed, customWalletFeeDistributed, legacyRewardDistributed, legacyCustomWalletFeeDistributed }) => {
    liquidityAdded.forEach((log: any) => {
      const meta = poolMeta[toPoolId(log)];
      if (!meta) return;
      addHookFee(meta.currency0, log.liquidity0, METRICS.hookLiquidityFees);
      addHookFee(meta.currency1, log.liquidity1, METRICS.hookLiquidityFees);
    });
    // Valued by the quote token the hook spent, not by the launched token it bought: the
    // quote side is the fee that was actually charged and is the side with a market price.
    buyback.forEach((log: any) => addHookFee(poolMeta[toPoolId(log)]?.quoteToken, log.ETHAmount, METRICS.hookBuybackFees));
    rewardDistributed.forEach((log: any) => addHookFee(toAddress(log.token), log.amount, METRICS.hookRewardFees));
    customWalletFeeDistributed.forEach((log: any) => addHookFee(toAddress(log.token), log.amount, METRICS.hookCustomWalletFees));
    legacyRewardDistributed.forEach((log: any) => addHookFee(legacyRewardToken[toPoolId(log)], log.amount, METRICS.hookRewardFees));
    legacyCustomWalletFeeDistributed.forEach((log: any) => addHookFee(poolMeta[toPoolId(log)]?.quoteToken, log.amount, METRICS.hookCustomWalletFees));
  });

  dailyFees.add(dailyRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    ...chainConfig,
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: "2025-12-24",
    },
  },
  methodology: {
    Fees:
      "Fees include treasury revenue, BasedBid core fee-recipient events, and the swap fees distributed by BasedBid hooks on Uniswap v4 and PancakeSwap Infinity pools, each valued in the token it was paid in (any quote token a project launched against). On Solana, fees are the protocol fee share (creation, trading, finalize and LP-claim fees) received by the BasedBid admin fee wallet in transactions involving the BasedBid program.",
    Revenue: "Revenue is measured only from FeeCollected inflows emitted by the treasury contract. On Solana, revenue equals tokens received by the BasedBid admin fee wallet in transactions involving the BasedBid program.",
    ProtocolRevenue: "Protocol revenue equals treasury FeeCollected inflows. On Solana, protocol revenue equals tokens received by the BasedBid admin fee wallet in transactions involving the BasedBid program.",
    SupplySideRevenue: "Includes sub-board, meme-owner and referral fees paid by the core contracts, plus hook fees added to liquidity, spent on buybacks, distributed as holder rewards and paid to custom wallets. Not tracked on Solana, where sub-board, meme-owner and referral shares are paid directly to per-token wallets.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.treasuryRevenue]: "Treasury FeeCollected amounts are included in total fees.",
      [METRICS.subBoardFees]: "SubBoardFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.memeOwnerFees]: "MemeOwnerFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.referralFees]: "ReferralFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.hookLiquidityFees]: "LiquidityAdded token0 and token1 amounts emitted by BasedBid hook contracts.",
      [METRICS.hookBuybackFees]: "Quote-token amount spent on project-token buybacks, from Buyback events emitted by BasedBid hook contracts.",
      [METRICS.hookRewardFees]: "RewardDistributed amounts valued in the token that was distributed.",
      [METRICS.hookCustomWalletFees]: "CustomWalletFeeDistributed amounts valued in the token that was paid out.",
    },
    Revenue: {
      [METRICS.treasuryRevenue]: "Token amounts from treasury FeeCollected events.",
    },
    ProtocolRevenue: {
      [METRICS.treasuryRevenue]: "Token amounts from treasury FeeCollected events.",
    },
    SupplySideRevenue: {
      [METRICS.subBoardFees]: "SubBoardFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.memeOwnerFees]: "MemeOwnerFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.referralFees]: "ReferralFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.hookLiquidityFees]: "LiquidityAdded token0 and token1 amounts emitted by BasedBid hook contracts.",
      [METRICS.hookBuybackFees]: "Quote-token amount spent on project-token buybacks, from Buyback events emitted by BasedBid hook contracts.",
      [METRICS.hookRewardFees]: "RewardDistributed amounts valued in the token that was distributed.",
      [METRICS.hookCustomWalletFees]: "CustomWalletFeeDistributed amounts valued in the token that was paid out.",
    },
  },
  doublecounted: true, //uniswap & pcs
};

export default adapter;
