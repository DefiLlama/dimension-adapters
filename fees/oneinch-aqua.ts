import { ethers } from "ethers";
import {
  FetchGetLogsOptions,
  FetchOptions,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { AQUA_SHIPPED_ABI, getAquaFills } from "../helpers/oneinchAqua";

// 1inch Aqua (https://github.com/1inch/aqua): LPs quote from their own wallets;
// swap fees are encoded per position as SwapVM fee instructions. At fill time
// the taker-paid amount (Pushed) is fee-inclusive: the LP keeps its share
// inside the maker wallet and the 1inch DAO's share is transferred to a
// purpose-deployed fee exchanger.
//
// This adapter decodes each position's fee rates from the strategy bytecode
// registered on-chain at ship time (Shipped event), then prices every fill of
// the day:
//   DAO share (revenue)   = pushedAmount * protocolFeeUnits / 1e9
//   LP-retained (supply)  = netAmount * (flatFeeUnits - protocolFeeUnits) / 1e9
// where netAmount is the pushed amount after netting a maker's own strategies
// traded against each other in the same transaction (helpers/oneinchAqua.ts).
// Fee units are uint32 with 1e9 = 100% (SwapVM Fee.sol). The protocol fee is
// 1/4 of the LP fee on low tiers (below ~0.1225%) and 1/6 above, encoded at
// position build time; positions created before the DAO fee launch carry
// protocolFeeUnits = 0 and their fees accrue fully to the LP.
//
// Scope: the AquaRouter registry (deployed 2026-07-19; same address on every
// chain). The original developer-release registry (2025-11-17) used an earlier
// SwapVM instruction table and its handful of strategies are excluded from fee
// computation - matching this adapter's start date, before which no DAO fee
// existed anyway.
const AQUA_ROUTER = "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a";

// The Shipped strategy bytes are an ABI-encoded SwapVM order; its data field
// is the program: repeated [opcodeIndex (1 byte), argsLength (1 byte), args].
// Opcode indices in the Aqua instruction set (@1inch/swap-vm-sdk
// aquaInstructions): 21 = Fee.flatFeeAmountInXD (args: uint32 feeUnits),
// 27/28 = Fee.(aqua)ProtocolFeeAmountInXD (args: uint32 feeUnits + address to).
const ORDER_TUPLE = "tuple(address maker, uint256 traits, bytes data)";
const FLAT_FEE_OPCODE = 21;
const PROTOCOL_FEE_OPCODES = [27, 28];
const FEE_BASE = BigInt(1e9);

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

function decodeStrategyFees(
  strategyHex: string,
): { flat: bigint; protocol: bigint } | null {
  try {
    const [order] = abiCoder.decode([ORDER_TUPLE], strategyHex);
    const program = ethers.getBytes(order.data);
    let flat = 0n;
    let protocol = 0n;
    for (let i = 0; i + 1 < program.length; ) {
      const opcode = program[i];
      const argsLength = program[i + 1];
      // Index 0 of the Aqua instruction set is the EMPTY_OPCODE placeholder,
      // never a real instruction; the SDK's own decoder throws
      // "Invalid opcode: 0 (NOT_INSTRUCTION)" on it. Mirror that: a program
      // carrying opcode 0 is malformed/foreign, so skip the whole strategy
      // (conservative undercount) rather than trust partial parses.
      if (opcode === 0) throw new Error(`invalid opcode 0 at byte ${i}`);
      const args = program.slice(i + 2, i + 2 + argsLength);
      if (opcode === FLAT_FEE_OPCODE && argsLength >= 4)
        flat = BigInt(new DataView(args.buffer, args.byteOffset).getUint32(0));
      if (PROTOCOL_FEE_OPCODES.includes(opcode) && argsLength >= 4)
        protocol = BigInt(
          new DataView(args.buffer, args.byteOffset).getUint32(0),
        );
      i += 2 + argsLength;
    }
    return { flat, protocol };
  } catch (e: any) {
    console.log(
      `oneinch-aqua: failed to decode strategy ${strategyHex.slice(0, 10)}… (${e?.message ?? e}) - its fills will carry zero fees`,
    );
    return null;
  }
}

const chainConfig: Record<
  string,
  { start: string; routerDeployBlock: number }
> = {
  [CHAIN.ETHEREUM]: { start: "2026-07-19", routerDeployBlock: 25555262 },
  [CHAIN.BASE]: { start: "2026-07-19", routerDeployBlock: 48768127 },
  [CHAIN.OPTIMISM]: { start: "2026-07-19", routerDeployBlock: 154363412 },
  [CHAIN.POLYGON]: { start: "2026-07-19", routerDeployBlock: 90413735 },
  [CHAIN.ARBITRUM]: { start: "2026-07-19", routerDeployBlock: 484939027 },
  [CHAIN.AVAX]: { start: "2026-07-19", routerDeployBlock: 90572258 },
  [CHAIN.XDAI]: { start: "2026-07-19", routerDeployBlock: 47255778 },
  [CHAIN.LINEA]: { start: "2026-07-19", routerDeployBlock: 31417368 },
  [CHAIN.SONIC]: { start: "2026-07-19", routerDeployBlock: 76110346 },
  [CHAIN.UNICHAIN]: { start: "2026-07-19", routerDeployBlock: 53577241 },
  [CHAIN.ERA]: { start: "2026-07-19", routerDeployBlock: 71209109 },
  [CHAIN.BSC]: { start: "2026-07-21", routerDeployBlock: 110591523 },
  [CHAIN.ROBINHOOD]: { start: "2026-07-21", routerDeployBlock: 12461295 },
  [CHAIN.ARC]: { start: "2026-09-02", routerDeployBlock: 18825813 },
};

const LABEL_LP = "Aqua LP Swap Fees";
const LABEL_DAO = "1inch DAO Fee Share";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // Same fills as the volume adapter: strategy-registration pushes excluded,
  // and a maker's own strategies traded against each other in one transaction
  // netted (netAmount).
  const fills = await getAquaFills(options, [AQUA_ROUTER]);
  if (!fills.length)
    return {
      dailyFees,
      dailySupplySideRevenue,
      dailyRevenue,
      dailyProtocolRevenue,
    };

  const filledStrategyHashes = new Set<string>(
    fills.map(({ strategyHash }) => strategyHash),
  );
  const feeByStrategyHash = new Map<
    string,
    { flat: bigint; protocol: bigint }
  >();
  await options.getLogs({
    target: AQUA_ROUTER,
    eventAbi: AQUA_SHIPPED_ABI,
    fromBlock: chainConfig[options.chain].routerDeployBlock,
    cacheInCloud: true,
    onlyArgs: true,
    collect: false,
    processor: (logs: any[]) =>
      logs.forEach(({ strategyHash, strategy }: any) => {
        const hash = String(strategyHash).toLowerCase();
        if (!filledStrategyHashes.has(hash) || feeByStrategyHash.has(hash))
          return;
        const fees = decodeStrategyFees(strategy);
        if (fees) feeByStrategyHash.set(hash, fees);
      }),
  } as FetchGetLogsOptions);

  fills.forEach(({ token, strategyHash, amount, netAmount }) => {
    const fees = feeByStrategyHash.get(strategyHash);
    if (!fees || (fees.flat === 0n && fees.protocol === 0n)) return;
    // The DAO share is an independent rate, not a slice of the flat fee, so a
    // (theoretical) protocol-only strategy still pays it; clamp the LP share
    // at zero for safety.
    const rate = fees.flat > fees.protocol ? fees.flat : fees.protocol;
    const daoShare = (amount * fees.protocol) / FEE_BASE;
    const lpShare =
      (netAmount * rate) / FEE_BASE - (netAmount * fees.protocol) / FEE_BASE;
    dailyFees.add(token, lpShare, LABEL_LP);
    dailyFees.add(token, daoShare, LABEL_DAO);
    dailySupplySideRevenue.add(token, lpShare, LABEL_LP);
    dailyRevenue.add(token, daoShare, LABEL_DAO);
    dailyProtocolRevenue.add(token, daoShare, LABEL_DAO);
  });

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, { start }]) => [chain, { start }]),
  ),
  methodology: {
    Fees: "Total Aqua swap fees paid by takers: each fill's taker-paid amount (Pushed event on the AquaRouter registry, fee-inclusive; strategy-registration pushes excluded) multiplied by the position's fee rate decoded from its on-chain strategy bytecode (SwapVM flat-fee instruction, 1e9 units = 100%). When a maker's own strategies trade against each other within one transaction, the LP fee is paid back to the same wallet and only counts on the maker's net change; the DAO share is always counted. Fills of positions on the legacy developer-release registry (pre-2026-07-19, a handful of test positions on an earlier instruction set) are excluded.",
    SupplySideRevenue:
      "The share of each fill's swap fee retained by the LP inside the maker-owned wallet (Aqua is non-custodial): total fee minus the DAO share. Fees a maker's own strategies pay each other within one transaction are excluded.",
    Revenue:
      "The 1inch DAO's encoded share of each fill's swap fee: 1/4 of the LP fee on low-fee tiers (below ~0.1225%) and 1/6 on higher tiers, transferred to the purpose-deployed per-chain DAO fee exchanger at fill time. Positions created before the DAO fee launch (2026-07-19; enabled 2026-07-21 on BNB Chain and Robinhood Chain) carry no DAO fee and contribute only to SupplySideRevenue. Cross-checked against measured ERC20 inflows to the fee exchangers.",
    ProtocolRevenue: "All DAO revenue accrues to the 1inch DAO treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL_LP]:
        "Swap-fee share retained by LPs in their own wallets, priced per fill from the decoded position fee rate.",
      [LABEL_DAO]:
        "Swap-fee share transferred to the 1inch DAO fee exchanger at fill time, priced per fill from the decoded protocol-fee rate.",
    },
    SupplySideRevenue: {
      [LABEL_LP]: "LP-retained swap fees (total fee minus the DAO share).",
    },
    Revenue: {
      [LABEL_DAO]:
        "The DAO's decoded per-fill fee share (validated against fee-exchanger inflows).",
    },
    ProtocolRevenue: {
      [LABEL_DAO]: "DAO fee share accruing to the 1inch DAO treasury.",
    },
  },
};

export default adapter;
