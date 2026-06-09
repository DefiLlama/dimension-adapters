import { parseEther } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const CONTRACTS = {
  BondingCurve: "0x3C4b0F2D3d5bBdf4E0B323f0a8Eec7B02Cce6d40",
  Arena: "0x9B3d636C27AD4CDEBFbE1F182B2b63F66Be7adE5",
  TokenFactory: "0x96c5E38362f86E52389E15a86247fB7326503c8d",
  HookRegistry: "0xC062c550b4abcbE8fa50DF05Ea353864d0E01262",
};

const swapAbi = "event Swap(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 fee)";
const battleSettledAbi = "event BattleSettled(uint256 indexed battleId, address winner, uint256 pot, uint256 protocolFee)";
const tokenCreatedAbi = "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 initialSupply)";
const hookRegisteredAbi = "event HookRegistered(bytes32 indexed hookId, address indexed author, string name, string category)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;

  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // BondingCurve swap fees (1% total: 0.70% protocol, 0.30% creator)
  const swapLogs = await getLogs({
    target: CONTRACTS.BondingCurve,
    eventAbi: swapAbi,
  });
  for (const log of swapLogs) {
    dailyFees.addGasToken(log.fee);
    dailyProtocolRevenue.addGasToken(log.fee * 70n / 100n);
    dailySupplySideRevenue.addGasToken(log.fee * 30n / 100n);
  }

  // Arena battle fees (5% of pot, all protocol)
  const battleLogs = await getLogs({
    target: CONTRACTS.Arena,
    eventAbi: battleSettledAbi,
  });
  for (const log of battleLogs) {
    dailyFees.addGasToken(log.protocolFee);
    dailyProtocolRevenue.addGasToken(log.protocolFee);
  }

  // Token launch fees (0.001 ETH each, all protocol)
  const launchLogs = await getLogs({
    target: CONTRACTS.TokenFactory,
    eventAbi: tokenCreatedAbi,
  });
  const launchFee = parseEther("0.001") * BigInt(launchLogs.length);
  dailyFees.addGasToken(launchFee);
  dailyProtocolRevenue.addGasToken(launchFee);

  // Hook registration fees (0.01 ETH each, all protocol)
  const registryLogs = await getLogs({
    target: CONTRACTS.HookRegistry,
    eventAbi: hookRegisteredAbi,
  });
  const regFee = parseEther("0.01") * BigInt(registryLogs.length);
  dailyFees.addGasToken(regFee);
  dailyProtocolRevenue.addGasToken(regFee);

  return { dailyFees, dailyRevenue: dailyProtocolRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Sum of all protocol fees: bonding curve swap fees (1%), arena battle fees (5% of pots), token launch fees (0.001 ETH), and hook registration fees (0.01 ETH).",
  Revenue: "Protocol's share: 70% of bonding curve fees, 100% of arena/launch/registration fees.",
  SupplySideRevenue: "Creator earnings: 30% of bonding curve swap fees.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2024-06-01",
  chains: [CHAIN.BASE],
  methodology,
  pullHourly: true,
};

export default adapter;
