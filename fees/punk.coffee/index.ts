import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const ROUTER_ADDRESS = "0x9c0F3c0C20D10297cA4bFB50846f3242Ea2B9787";
const FACTORY_ADDRESS = "0xF7262C7eb1737f7701130C0151C0697Ad7c7A94D";

const PlatformAndCommunityFeesClaimedEvent =
  "event PlatformAndCommunityFeesClaimedViaRouter(address indexed operator, address indexed market, address platformAddr, uint256 platformFee, address communityAddr, uint256 communityFee)";
const MarketCreatedEvent =
  "event MarketCreated (address indexed creator, uint256 indexed marketId, address indexed marketAddress, (string, uint256, string, uint256, string[], bool))";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const feeClaimedLogs: any[] = await options.getLogs({
    target: ROUTER_ADDRESS,
    eventAbi: PlatformAndCommunityFeesClaimedEvent,
  });

  feeClaimedLogs.forEach((log: any) => {
    const totalFee = BigInt(log.platformFee) + BigInt(log.communityFee);
    dailyFees.add(ADDRESSES.bsc.USDT, totalFee);
  });

  const marketCreatedLogs: any[] = await options.getLogs({
    target: FACTORY_ADDRESS,
    eventAbi: MarketCreatedEvent,
  });

  if (marketCreatedLogs.length > 0) {
    const createFee = await options.api.call({
      target: FACTORY_ADDRESS,
      abi: "function createFee() external view returns (uint256)",
    });

    const totalCreationFee = BigInt(marketCreatedLogs.length) * BigInt(createFee);
    dailyFees.addGasToken(totalCreationFee);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Trading fees + market creation fees.",
  Revenue: "All fees collected by the protocol from trading and market creation.",
  ProtocolRevenue: "All fees are protocol revenue.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: "2025-10-08",
  methodology,
};

export default adapter;
