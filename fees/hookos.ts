import { parseEther } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// HookOS core fee contracts per chain, synced from the canonical deployment
// registry (contracts/deployments/addresses.json) and verified on each chain's
// explorer. All four core sources are deployed on every supported chain.
type FeeContracts = {
  BondingCurve: string; // emits Swap (1% fee: 0.70% protocol / 0.30% creator)
  Arena: string;        // emits BattleSettled (5% protocol fee on pot)
  TokenFactory: string; // emits TokenCreated (0.001 ETH launch fee)
  HookRegistry: string; // emits HookRegistered (0.01 ETH registration fee)
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

const swapAbi = "event Swap(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 fee)";
const battleSettledAbi = "event BattleSettled(uint256 indexed battleId, address winner, uint256 pot, uint256 protocolFee)";
const tokenCreatedAbi = "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 initialSupply)";
const hookRegisteredAbi = "event HookRegistered(bytes32 indexed hookId, address indexed author, string name, string category)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances, chain } = options;
  const contracts = CONTRACTS[chain];

  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // BondingCurve swap fees (1% total: 0.70% protocol, 0.30% creator)
  const swapLogs = await getLogs({
    target: contracts.BondingCurve,
    eventAbi: swapAbi,
  });
  for (const log of swapLogs) {
    // split 70/30 via remainder so dailyFees === protocol + supplySide exactly (no dropped wei)
    const protocolShare = log.fee * 70n / 100n;
    const creatorShare = log.fee - protocolShare;
    dailyFees.addGasToken(log.fee, 'Swap Fees');
    dailyProtocolRevenue.addGasToken(protocolShare, 'Swap Fees To Protocol');
    dailySupplySideRevenue.addGasToken(creatorShare, 'Swap Fees To Creators');
  }

  // Arena battle fees (5% of pot, all protocol)
  const battleLogs = await getLogs({
    target: contracts.Arena,
    eventAbi: battleSettledAbi,
  });
  for (const log of battleLogs) {
    dailyFees.addGasToken(log.protocolFee, 'Arena Battle Fees');
    dailyProtocolRevenue.addGasToken(log.protocolFee, 'Arena Battle Fees To Protocol');
  }

  // Token launch fees (0.001 ETH flat fee per launch, charged by TokenFactory, all protocol)
  const launchLogs = await getLogs({
    target: contracts.TokenFactory,
    eventAbi: tokenCreatedAbi,
  });
  const launchFee = parseEther("0.001") * BigInt(launchLogs.length);
  dailyFees.addGasToken(launchFee, 'Token Launch Fees');
  dailyProtocolRevenue.addGasToken(launchFee, 'Token Launch Fees To Protocol');

  // Hook registration fees (0.01 ETH flat fee per registration, charged by HookRegistry, all protocol)
  const registryLogs = await getLogs({
    target: contracts.HookRegistry,
    eventAbi: hookRegisteredAbi,
  });
  const regFee = parseEther("0.01") * BigInt(registryLogs.length);
  dailyFees.addGasToken(regFee, 'Hook Registration Fees');
  dailyProtocolRevenue.addGasToken(regFee, 'Hook Registration Fees To Protocol');

  return { dailyFees, dailyRevenue: dailyProtocolRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Sum of all protocol fees: bonding curve swap fees (1%), arena battle fees (5% of pots), token launch fees (0.001 ETH), and hook registration fees (0.01 ETH).",
  Revenue: "Protocol's share: 70% of bonding curve fees, 100% of arena/launch/registration fees.",
  SupplySideRevenue: "Creator earnings: 30% of bonding curve swap fees.",
};

const breakdownMethodology = {
  Fees: {
    'Swap Fees': 'Bonding curve swap fees (1% of ETH volume).',
    'Arena Battle Fees': '5% protocol fee on arena battle pots.',
    'Token Launch Fees': '0.001 ETH flat fee per token launch.',
    'Hook Registration Fees': '0.01 ETH flat fee per hook registration.',
  },
  Revenue: {
    'Swap Fees To Protocol': '70% of bonding curve swap fees.',
    'Arena Battle Fees To Protocol': '100% of arena battle fees.',
    'Token Launch Fees To Protocol': '100% of token launch fees.',
    'Hook Registration Fees To Protocol': '100% of hook registration fees.',
  },
  SupplySideRevenue: {
    'Swap Fees To Creators': '30% of bonding curve swap fees to token creators.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2024-06-01",
  chains: [CHAIN.BASE, CHAIN.MEGAETH, CHAIN.HYPERLIQUID],
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
