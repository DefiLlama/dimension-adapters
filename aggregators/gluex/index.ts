import { FetchOptions, FetchResultVolumeFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const eventRouted = `event Routed(
  bytes indexed uniquePID,
  address indexed userAddress,
  address outputReceiver,
  address inputToken,
  uint256 inputAmount,
  address outputToken,
  uint256 outputAmount,
  uint256 partnerFee,
  uint256 routingFee,
  uint256 finalOutputAmount
)`;

const ROUTERS = {
  [CHAIN.ETHEREUM]:     "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.ARBITRUM]:     "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.BASE]:         "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.XDAI]:         "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.BSC]:          "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.POLYGON]:      "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.AVAX]:         "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.OPTIMISM]:     "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.BLAST]:        "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.LINEA]:        "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.MANTLE]:       "0x85fb41c470B8Dd2C9aD262F38e38E42a2f92C285",
  [CHAIN.SCROLL]:       "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.TAIKO]:        "0x75e74A67Bd4A76BcE60bb0546f092571c3133523",
  [CHAIN.BERACHAIN]:    "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.SONIC]:        "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.UNICHAIN]:     "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
  [CHAIN.HYPERLIQUID]:  "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7",
};

const NATIVE_TOKENS: Record<string, string> = {
  [CHAIN.ETHEREUM]:     "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 
  [CHAIN.ARBITRUM]:     "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.BASE]:         "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.XDAI]:         "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.BSC]:          "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 
  [CHAIN.POLYGON]:      "0x0000000000000000000000000000000000001010", 
  [CHAIN.AVAX]:         "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 
  [CHAIN.OPTIMISM]:     "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.BLAST]:        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.LINEA]:        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.MANTLE]:       "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.SCROLL]:       "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.TAIKO]:        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.BERACHAIN]:    "0x0000000000000000000000000000000000000000 ",
  [CHAIN.SONIC]:        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.UNICHAIN]:     "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [CHAIN.HYPERLIQUID]:  "0x2222222222222222222222222222222222222222",
};

const START = 1741967399; // Mar-14-2025

async function fetch({ getLogs, createBalances, chain }: FetchOptions): Promise<FetchResultVolumeFees> {
  const router = ROUTERS[chain];
  const nativeToken = NATIVE_TOKENS[chain]?.toLowerCase();
  const logs = await getLogs({ targets: [router], eventAbi: eventRouted });
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  logs.forEach((log) => {
    const token = log.inputToken.toLowerCase();
    const inputAmount = log.inputAmount;
    const routingFee = log.routingFee;

    const isNative = token === nativeToken;

    if (isNative) {
      dailyVolume.addGasToken(inputAmount);
      dailyFees.addGasToken(routingFee);
    } else {
      dailyVolume.add(token, inputAmount);
      dailyFees.add(token, routingFee);
    }
  });

  return {
    dailyVolume,
    dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(ROUTERS).reduce((acc, chain) => {
    acc[chain] = { fetch, start: START };
    return acc;
  }, {} as SimpleAdapter["adapter"]),
};

export default adapter;