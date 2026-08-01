import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Event ABIs
const eventOld = `event Routed(bytes indexed uniquePID, address indexed userAddress, address outputReceiver, address inputToken, uint256 inputAmount, address outputToken, uint256 outputAmount, uint256 partnerFee, uint256 routingFee, uint256 finalOutputAmount)`;

const eventNew = `event Routed(bytes32 indexed uniquePID, address indexed userAddress, address outputReceiver, address inputToken, uint256 inputAmount, address outputToken, uint256 finalOutputAmount, uint256 partnerFee, uint256 routingFee, uint256 partnerShare, uint256 protocolShare)`;

// Native token identifiers (used with addGasToken)
const gasTokens = new Set([
  ADDRESSES.GAS_TOKEN_2,                  // 0xeeee...eeee
  ADDRESSES.null,                         // 0x0000...0000
  '0x2222222222222222222222222222222222222222', // Hyperliquid
  ADDRESSES.polygon.WMATIC_1,             // WMATIC on Polygon
]);

// Router addresses
const ROUTERS_OLD: Partial<Record<string, string>> = {
  [CHAIN.ETHEREUM]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.ARBITRUM]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.BASE]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.XDAI]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.BSC]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.POLYGON]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.AVAX]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.OPTIMISM]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.BLAST]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.LINEA]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.MANTLE]: "0x85fb41c470B8Dd2C9aD262F38e38E42a2f92C285",
  [CHAIN.SCROLL]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.TAIKO]: "0x75e74A67Bd4A76BcE60bb0546f092571c3133523",
  [CHAIN.BERACHAIN]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.SONIC]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.UNICHAIN]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.HYPERLIQUID]: "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7"
};

// Router addresses
const ROUTERS_NEW: Partial<Record<string, string>> = {
  [CHAIN.ETHEREUM]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.ARBITRUM]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.BASE]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.XDAI]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.BSC]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.POLYGON]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.AVAX]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.OPTIMISM]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.BLAST]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.LINEA]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.MANTLE]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.SCROLL]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.TAIKO]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.BERACHAIN]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.SONIC]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.UNICHAIN]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.HYPERLIQUID]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd",
  [CHAIN.PLASMA]: "0xe95f6eaeae1e4d650576af600b33d9f7e5f9f7fd"
};

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances, chain } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const oldRouter = ROUTERS_OLD[chain];
  const newRouter = ROUTERS_NEW[chain];

  if (oldRouter) {
    const oldLogs = await getLogs({ targets: [oldRouter], eventAbi: eventOld });
    for (const log of oldLogs) {
      const token = log.outputToken.toLowerCase();
      const outputAmount = log.outputAmount;
      const fee = log.partnerFee + log.routingFee;
      const revenue = log.routingFee;

      const isNative = gasTokens.has(token);
      if (isNative) {
        dailyVolume.addGasToken(outputAmount);
        dailyFees.addGasToken(fee);
        dailyRevenue.addGasToken(revenue);
      } else {
        dailyVolume.add(token, outputAmount);
        dailyFees.add(token, fee);
        dailyRevenue.add(token, revenue);
      }
    }
  }

  if (newRouter) {
    const newLogs = await getLogs({ targets: [newRouter], eventAbi: eventNew });
    for (const log of newLogs) {
      const token = log.outputToken.toLowerCase();
      const outputAmount = log.finalOutputAmount;
      const fee = log.partnerFee + log.routingFee + log.partnerShare + log.protocolShare;
      const revenue = log.protocolShare;

      const isNative = gasTokens.has(token);
      if (isNative) {
        dailyVolume.addGasToken(outputAmount);
        dailyFees.addGasToken(fee);
        dailyRevenue.addGasToken(revenue);
      } else {
        dailyVolume.add(token, outputAmount);
        dailyFees.add(token, fee);
        dailyRevenue.add(token, revenue);
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const methodology = {
  Fees: "Fees paid by users for swaps.",
  Revenue: "Revenue is calculated as the sum of routingFee for the old contract and the sum of protocolShare for the new contract.",
  ProtocolRevenue: "Protocol Revenue is calculated as the sum of routing fees and protocol share."
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {},
  start: '2025-03-14',
  fetch,
  chains: Object.keys({ ...ROUTERS_OLD, ...ROUTERS_NEW }),
  methodology,
};

export default adapter;
