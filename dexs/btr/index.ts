import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// BTR DEX (AIMM) - adaptive inventory market maker, live on Monad mainnet (chainId 143).
// Pools are deterministic CREATE3 PoolProxy instances minted by the PoolFactory below (same address
// on every chain BTR deploys to). Every fill emits one canonical `Swapped` event on the pool:
// `amounts` is packed `amountIn | amountOut << 128` and `fees` is `protoFee | lpFee << 128`. The
// whole fee is charged on the output leg, in `tokenOut` units; there is no input-leg fee and no
// separate fee-transfer transaction (source: dex-evm/src/interfaces/IPool.sol `Swapped`,
// dex-evm/src/libraries/PricingLib.sol `_settleAndPay`).
//
// Protocol-owned flow is excluded. `Pool.swapCoop_cd` (coop fill) is callable only by addresses
// holding the COOP_ENABLED permission bit on BTR's AccessControl, which is granted only to BTR's own
// CoopArb contracts (protocol-owned atomic arbitrage; lane-12 operators call CoopArb, the pool-side
// `sender` is the CoopArb contract). Those fills rebalance the pool
// against external venues, whose own adapters already count the external leg, so they are neither
// user volume nor user fees. The `Swapped.sender` of a coop fill is the CoopArb contract, so each
// distinct sender's permissions are read at the period's end block and coop senders are dropped.
const FACTORY = "0xbbbbbbbbbd5e955E20F323cA1F95f8191fD0E0BF";
const ACCESS_CONTROL = "0xbbbbbbbb3473f8433A8A1a044E8a102D39dC8779";
const COOP_ENABLED = 1n << 11n; // dex-evm/src/libraries/PoolConstantsLib.sol COOP_ENABLED_BIT (AC lane 11)

const SWAPPED =
  "event Swapped(address indexed sender, address indexed recipient, address indexed tokenIn, address tokenOut, uint256 amounts, uint256 fees, uint256 prices, uint256 outBook, uint256 outState)";

const abi = {
  getOfficialPoolsCount: "function getOfficialPoolsCount() view returns (uint256)",
  officialPools: "function officialPools(uint256) view returns (address)",
  perms: "function perms(address) view returns (uint256)",
};

const U128 = (1n << 128n) - 1n;

// Only chains with a live pool factory are listed. Monad is the sole live mainnet deployment
// (dex-evm deployments/143.pools.json); BNB (56) is a zeroed scaffold, Base has no pool factory
// record and Arc is a testnet, so they are intentionally absent.
const chainConfig: Record<string, { start: string }> = {
  [CHAIN.MONAD]: { start: "2026-10-01" }, // PoolFactory.createPool, block 109610388
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const count = Number(await options.api.call({ target: FACTORY, abi: abi.getOfficialPoolsCount }));
  const pools: string[] = count
    ? await options.api.multiCall({
        target: FACTORY,
        abi: abi.officialPools,
        calls: Array.from({ length: count }, (_, i) => ({ params: [i] })),
      })
    : [];
  const logs = pools.length ? await options.getLogs({ targets: pools, eventAbi: SWAPPED }) : [];

  const senders = [...new Set(logs.map((log: any) => String(log.sender).toLowerCase()))];
  const senderPerms = senders.length
    ? await options.api.multiCall({ target: ACCESS_CONTROL, abi: abi.perms, calls: senders })
    : [];
  const coop = new Set(senders.filter((_, i) => (BigInt(senderPerms[i]) & COOP_ENABLED) !== 0n));

  for (const log of logs) {
    if (coop.has(String(log.sender).toLowerCase())) continue;
    const amounts = BigInt(log.amounts);
    const fees = BigInt(log.fees);
    const protoFee = fees & U128;
    const lpFee = fees >> 128n;
    dailyVolume.add(log.tokenIn, amounts & U128);
    dailyFees.add(log.tokenOut, protoFee + lpFee, "Swap Fees");
    dailyRevenue.add(log.tokenOut, protoFee, "Swap Fees To Protocol");
    dailySupplySideRevenue.add(log.tokenOut, lpFee, "Swap Fees To LPs");
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
  Volume:
    "Input-token amount (amountIn) of every swap on BTR pools, read from the pool Swapped event and counted once per swap. Coop fills by BTR's own CoopArb contracts (protocol-owned arbitrage) are excluded.",
  Fees:
    "Swap fee charged on the output token of each swap (protocol share plus LP share), read from the Swapped event. The coverage toll a swap may pay when it drains a leg below its coverage floor stays in the leg's reserves as a buffer and is not counted. Coop fills by BTR's own CoopArb contracts are excluded.",
  UserFees: "All swap fees are paid by the swapper.",
  Revenue: "Protocol share (protoFee) of the swap fee.",
  ProtocolRevenue: "The protocol share (protoFee) of the swap fee goes to the BTR treasury.",
  SupplySideRevenue: "LP share (lpFee) of the swap fee, accrued to the liquidity providers of the output leg.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Swap fee charged on the output token of each swap (protocol share plus LP share).",
  },
  UserFees: {
    "Swap Fees": "Swap fee charged on the output token of each swap (protocol share plus LP share).",
  },
  Revenue: {
    "Swap Fees To Protocol": "Protocol share (protoFee) of the swap fee.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol": "Protocol share (protoFee) of the swap fee, sent to the BTR treasury.",
  },
  SupplySideRevenue: {
    "Swap Fees To LPs": "LP share (lpFee) of the swap fee, accrued to the output leg's liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
