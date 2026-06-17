import { parseEther } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Per-chain HookOS core fee contracts. Addresses come from the canonical
// deployment registry (contracts/deployments/addresses.json), the official docs
// (https://docs.hookos.fun/contracts) and are verified on each chain's explorer.
// NB: the same address can host different roles across chains because contracts
// are deployed deterministically (same deployer + nonce ⇒ identical CREATE
// address), e.g. 0x9B3d…adE5 is TokenFactory on Base but Arena on HyperEVM.
type FeeContracts = {
  BondingCurve: string;
  Arena: string;
  TokenFactory: string;
  HookRegistry: string;
};

const CONTRACTS: Record<string, FeeContracts> = {
  [CHAIN.BASE]: {
    BondingCurve: "0x3C4b0F2D3d5bBdf4E0B323f0a8Eec7B02Cce6d40",
    Arena:        "0x47C839295754307E635DC6bEf89856267932dD38",
    TokenFactory: "0x9B3d636C27AD4CDEBFbE1F182B2b63F66Be7adE5",
    HookRegistry: "0x467A8Ab4A9B65D8Da151F402021b17A147C058c5",
  },
  [CHAIN.MEGAETH]: {
    BondingCurve: "0x6A2fAa5Da2B9F1515661f18160C0A0d584c0AC15",
    Arena:        "0x30801EAb4C458cF8795eED77cAe5e3F422678347",
    TokenFactory: "0x9Bb58abC4A41eaC5692F42Dc59e15b0efb92af81",
    HookRegistry: "0xE1Ecb2b6bB656FF32C886ff41dA59A159EFF41f0",
  },
  [CHAIN.HYPERLIQUID]: {
    BondingCurve: "0x93f35a190E6B7ed05E7bBAb78199720C0c849dDE",
    Arena:        "0x9B3d636C27AD4CDEBFbE1F182B2b63F66Be7adE5",
    TokenFactory: "0x96c5E38362f86E52389E15a86247fB7326503c8d",
    HookRegistry: "0x64E3167b2B4eA1b8e3DdCaFe66a5b435BE7cD75f",
  },
};

// Fee rates are admin-settable on-chain values (not present in the emitted
// events) and DO change over time, so they are read live from the contracts at
// the queried block — on an archive node this yields the exact rate in effect on
// that day. The constants below are only fallbacks for when a read is
// unavailable; they are the deploy-time / documented defaults
// (https://docs.hookos.fun/contracts): swap fee 1% (protocolFeeBps=100),
// arena 2.5% (250), launch 0.005 ETH, registration 0.01 ETH.
const DEFAULT_CURVE_FEE_BPS = 100n;
const DEFAULT_CREATOR_FEE_BPS = 0n;
const DEFAULT_ARENA_FEE_BPS = 250n;
const DEFAULT_LAUNCH_FEE = parseEther("0.005");
const DEFAULT_REGISTRATION_FEE = parseEther("0.01");

// Event ABIs — verified against the deployed contract source
// (HookOS protocol repo: BondingCurve.sol, Arena.sol, TokenFactory.sol, HookRegistry.sol).
const tokenBoughtAbi = "event TokenBought(address indexed token, address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 newPrice)";
const tokenSoldAbi = "event TokenSold(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 newPrice)";
const battleSettledAbi = "event BattleSettled(uint256 indexed battleId, uint8 winner, uint256 totalPot)";
const tokenCreatedAbi = "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 initialSupply)";
const hookRegisteredAbi = "event HookRegistered(bytes32 indexed hookId, address indexed author, string name, address implementation)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances, api, chain } = options;
  const c = CONTRACTS[chain];

  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Read the live fee rates at the queried block (admin-settable; on an archive
  // node this is the exact rate in effect that day). Reads that fail fall back to
  // documented defaults.
  const readUint = (target: string, fn: string, fallback: bigint) =>
    api.call({ target, abi: `function ${fn}() view returns (uint256)` }).then(BigInt).catch(() => fallback);

  let [curveFeeBps, creatorFeeBps, arenaFeeBps, launchFee, registrationFee] = await Promise.all([
    readUint(c.BondingCurve, "protocolFeeBps", DEFAULT_CURVE_FEE_BPS),
    readUint(c.BondingCurve, "creatorFeeBps", DEFAULT_CREATOR_FEE_BPS),
    readUint(c.Arena, "protocolFeeBps", DEFAULT_ARENA_FEE_BPS),
    readUint(c.TokenFactory, "launchFee", DEFAULT_LAUNCH_FEE),
    readUint(c.HookRegistry, "registrationFee", DEFAULT_REGISTRATION_FEE),
  ]);
  // Guard against a garbage/zero read (e.g. from a non-archive RPC) that would
  // break the sell-fee reconstruction or misattribute the creator split.
  if (curveFeeBps <= 0n || curveFeeBps >= 10000n) curveFeeBps = DEFAULT_CURVE_FEE_BPS;
  if (creatorFeeBps > curveFeeBps) creatorFeeBps = curveFeeBps;

  // BondingCurve swap fees: curveFeeBps of the gross trade ETH on every buy/sell.
  // Buys emit gross ethIn (msg.value); sells emit net ethOut (proceeds after fee).
  // The creator slice mirrors the contract (creatorFee = totalFee * creatorFeeBps /
  // protocolFeeBps), which is always ≤ totalFee, so the protocol share stays positive.
  const [buyLogs, sellLogs] = await Promise.all([
    getLogs({ target: c.BondingCurve, eventAbi: tokenBoughtAbi }),
    getLogs({ target: c.BondingCurve, eventAbi: tokenSoldAbi }),
  ]);
  const addSwapFee = (totalFee: bigint) => {
    dailyFees.addGasToken(totalFee, 'Swap Fees');
    if (creatorFeeBps > 0n) {
      dailySupplySideRevenue.addGasToken((totalFee * creatorFeeBps) / curveFeeBps, 'Creator Fees');
    }
  };
  for (const log of buyLogs) {
    addSwapFee((log.ethIn * curveFeeBps) / 10000n);
  }
  for (const log of sellLogs) {
    // reconstruct fee from net proceeds: gross = ethOut / (1 - curveFeeBps/10000)
    addSwapFee((log.ethOut * curveFeeBps) / (10000n - curveFeeBps));
  }

  // Arena battle fees: arenaFeeBps of the settled pot, all protocol.
  const battleLogs = await getLogs({ target: c.Arena, eventAbi: battleSettledAbi });
  for (const log of battleLogs) {
    dailyFees.addGasToken((log.totalPot * arenaFeeBps) / 10000n, 'Arena Battle Fees');
  }

  // Token launch fees: flat launchFee per TokenCreated, all protocol.
  if (launchFee > 0n) {
    const launchLogs = await getLogs({ target: c.TokenFactory, eventAbi: tokenCreatedAbi });
    dailyFees.addGasToken(launchFee * BigInt(launchLogs.length), 'Token Launch Fees');
  }

  // Hook registration fees: flat registrationFee per HookRegistered, all protocol.
  if (registrationFee > 0n) {
    const registryLogs = await getLogs({ target: c.HookRegistry, eventAbi: hookRegisteredAbi });
    dailyFees.addGasToken(registrationFee * BigInt(registryLogs.length), 'Hook Registration Fees');
  }

  // Protocol revenue = all fees minus the creator (supply-side) share.
  dailyProtocolRevenue.addBalances(dailyFees);
  dailyProtocolRevenue.subtract(dailySupplySideRevenue);

  return { dailyFees, dailyRevenue: dailyProtocolRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "All protocol fees: bonding-curve swap fees (curveFeeBps of trade ETH), arena battle fees (arenaFeeBps of the pot), token launch fees (flat launchFee per launch) and hook registration fees (flat registrationFee per registration). Rates are the verified on-chain values.",
  Revenue: "Fees retained by the protocol: total fees minus the creator share of bonding-curve swap fees.",
  ProtocolRevenue: "Same as Revenue — fees retained by the protocol.",
  SupplySideRevenue: "Creator earnings: the share of bonding-curve swap fees routed to token creators.",
};

const breakdownMethodology = {
  Fees: {
    'Swap Fees': 'Bonding curve swap fees (curveFeeBps of gross trade ETH).',
    'Arena Battle Fees': 'arenaFeeBps of arena battle pots.',
    'Token Launch Fees': 'Flat launchFee charged per token launch.',
    'Hook Registration Fees': 'Flat registrationFee charged per hook registration.',
  },
  SupplySideRevenue: {
    'Creator Fees': 'Share of bonding-curve swap fees routed to token creators.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [
    [CHAIN.BASE, { start: '2026-06-05' }],
    [CHAIN.MEGAETH, { start: '2026-06-14' }],
    [CHAIN.HYPERLIQUID, { start: '2026-06-07' }],
  ],
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
