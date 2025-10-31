import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { keccak256, AbiCoder } from "ethers";

/*//////////////////////////////////////////////////////////////
                            CONSTANTS
//////////////////////////////////////////////////////////////*/

// Bit mask constants
const X1 = 0x1n;
const X5 = 0x1fn;
const X13 = 0x1fffn;
const X60 = 0xfffffffffffffffn;
const X64 = 0xffffffffffffffffn;

// Bit position constants
const BITS_DEX_LITE_DEX_VARIABLES_FEE = 0n;
const BITS_DEX_LITE_DEX_VARIABLES_TOKEN_0_DECIMALS = 126n;
const BITS_DEX_LITE_DEX_VARIABLES_TOKEN_1_DECIMALS = 131n;

// const BITS_DEX_LITE_SWAP_DATA_DEX_ID = 0n;
const BITS_DEX_LITE_SWAP_DATA_SWAP_0_TO_1 = 64n;
const BITS_DEX_LITE_SWAP_DATA_AMOUNT_IN = 65n;
const BITS_DEX_LITE_SWAP_DATA_AMOUNT_OUT = 125n;

// DEX Lite interfaces
interface DexKey {
  token0: string;
  token1: string;
  salt: string;
}

type LogSwapEventArgs = [bigint, bigint];

// DEX Lite contract addresses
const dexLiteContract = (chain: string) => {
  switch (chain) {
    case CHAIN.ETHEREUM:
      return "0xBbcb91440523216e2b87052A99F69c604A7b6e00";
    default:
      return null; // DEX Lite only available on Ethereum for now
  }
}

const dexLiteResolver = (chain: string) => {
  switch (chain) {
    case CHAIN.ETHEREUM:
      return "0x26b696D0dfDAB6c894Aa9a6575fCD07BB25BbD2C";
    default:
      return null; // DEX Lite only available on Ethereum for now
  }
}

// Utility function to calculate dexId from DexKey
const calculateDexId = (dexKey: DexKey): string => {
  // This matches the _calculateDexId function in the resolver contract:
  // bytes8(keccak256(abi.encode(dexKey_)))
  
  // Encode the DexKey struct: (address token0, address token1, bytes32 salt)
  const abiCoder = new AbiCoder();
  const encoded = abiCoder.encode(
    ['tuple(address,address,bytes32)'],
    [[dexKey.token0, dexKey.token1, dexKey.salt]]
  );
  
  // Calculate keccak256 hash and take first 8 bytes (bytes8)
  const hash = keccak256(encoded);
  return hash.slice(0, 18); // "0x" + 16 hex chars = 8 bytes (bytes8)
};

// Utility functions to parse LogSwap event data
const parseLogSwapData = (swapData: bigint) => {
  // swapData layout (matching dexLiteSlotsLink.sol):
  // BITS_DEX_LITE_SWAP_DATA_DEX_ID (0-63) => dexId
  // BITS_DEX_LITE_SWAP_DATA_SWAP_0_TO_1 (64) => swap0To1 (1 => true, 0 => false)
  // BITS_DEX_LITE_SWAP_DATA_AMOUNT_IN (65-124) => amount in adjusted (9 decimals)
  // BITS_DEX_LITE_SWAP_DATA_AMOUNT_OUT (125-184) => amount out adjusted (9 decimals)

  const dexId = "0x" + (swapData & X64).toString(16).padStart(16, '0');
  const swap0To1 = ((swapData >> BITS_DEX_LITE_SWAP_DATA_SWAP_0_TO_1) & X1) === 1n;
  const amountInAdjusted = (swapData >> BITS_DEX_LITE_SWAP_DATA_AMOUNT_IN) & X60;
  const amountOutAdjusted = (swapData >> BITS_DEX_LITE_SWAP_DATA_AMOUNT_OUT) & X60;

  return {
    dexId,
    swap0To1,
    amountInAdjusted,
    amountOutAdjusted
  };
};

const abi = {
  // DEX Lite ABIs
  getAllDexes: "function getAllDexes() view returns (tuple(address token0, address token1, bytes32 salt)[])",
  logSwap: "event LogSwap(uint256 swapData, uint256 dexVariables)",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // Process DEX Lite events if available on this chain
  let dexLiteSwapEvents: any[] = [];
  
  const dexLiteContractAddress = dexLiteContract(options.api.chain);
  const dexLiteResolverAddress = dexLiteResolver(options.api.chain);
  
  if (dexLiteContractAddress && dexLiteResolverAddress) {
    try {
      // Get all DEX Lite pools (just the DexKeys)
      const dexKeys: DexKey[] = await options.api.call({ 
        target: dexLiteResolverAddress, 
        abi: abi.getAllDexes 
      });

      // Create a map from dexId to DexKey for quick lookup
      const dexIdToPool: { [dexId: string]: DexKey } = {};
      dexKeys.forEach(dexKey => {
        const dexId = calculateDexId(dexKey);
        dexIdToPool[dexId] = dexKey;
      });

      // Get LogSwap events
      const logSwapEvents: LogSwapEventArgs[] = await options.getLogs({
        target: dexLiteContractAddress,
        onlyArgs: true,
        eventAbi: abi.logSwap,
      });

      // Process all LogSwap events
      const eventsToProcess = logSwapEvents;
      
      dexLiteSwapEvents = eventsToProcess.map(event => {
        // LogSwap event args: (uint256 swapData, uint256 dexVariables)
        // With onlyArgs: true, getLogs returns arrays: [swapData, dexVariables]
        const swapData = event[0] as bigint;
        const dexVariablesRaw = event[1] as bigint;
        
        const { dexId, swap0To1, amountInAdjusted, amountOutAdjusted } = parseLogSwapData(swapData);
        
        // Find the corresponding pool to get token addresses
        const dexKey = dexIdToPool[dexId];
        if (!dexKey) {
          console.warn(`No pool data found for dexId: ${dexId}`);
          return null;
        }

        const { token0, token1 } = dexKey;
        
        // Use dexVariables from the event itself (more accurate and efficient)
        const dexVariablesUint256 = BigInt(dexVariablesRaw);
        
        // Extract values from packed dexVariables according to bit layout (matching dexLiteSlotsLink.sol):
        // BITS_DEX_LITE_DEX_VARIABLES_FEE (0-12) => fee (13 bits, 1% = 10000)
        // BITS_DEX_LITE_DEX_VARIABLES_TOKEN_0_DECIMALS (126-130) => token0Decimals (5 bits)
        // BITS_DEX_LITE_DEX_VARIABLES_TOKEN_1_DECIMALS (131-135) => token1Decimals (5 bits)
        
        const fee = (dexVariablesUint256 >> BITS_DEX_LITE_DEX_VARIABLES_FEE) & X13;
        
        // Extract token decimals from the packed value
        const token0Decimals = (dexVariablesUint256 >> BITS_DEX_LITE_DEX_VARIABLES_TOKEN_0_DECIMALS) & X5;
        const token1Decimals = (dexVariablesUint256 >> BITS_DEX_LITE_DEX_VARIABLES_TOKEN_1_DECIMALS) & X5;

        return {
          swap0to1: swap0To1,
          amountInAdjusted,
          amountOutAdjusted,
          token0,
          token1,
          fee,
          token0Decimals,
          token1Decimals,
          isDexLite: true
        };
      }).filter(event => event !== null);
    } catch (error) {
      console.warn("Failed to fetch DEX Lite data:", error);
    }
  }

  // Process DEX Lite events 
  const processDexLiteEvents = (events: any[]) => {
    events.forEach((item: any) => {
      const { swap0to1, amountInAdjusted, token0, token1, fee, token0Decimals, token1Decimals } = item

      // Skip if amounts are zero or invalid
      if (!amountInAdjusted || amountInAdjusted === 0n) return;
      
      // Convert adjusted amounts (9 decimals) to actual token amounts
      const token0DecimalsNum = Number(token0Decimals);
      const token1DecimalsNum = Number(token1Decimals);
      
      let actualAmountIn: bigint;
      let actualToken: string;
      
      if (swap0to1) {
        // Converting from 9 decimals to token0 decimals
        // USDC has 6 decimals, so we need to divide by 10^(9-6) = 10^3 = 1000
        actualAmountIn = token0DecimalsNum >= 9 
          ? amountInAdjusted * (10n ** BigInt(token0DecimalsNum - 9))
          : amountInAdjusted / (10n ** BigInt(9 - token0DecimalsNum));
        actualToken = token0;
      } else {
        // Converting from 9 decimals to token1 decimals  
        // USDT has 6 decimals, so we need to divide by 10^(9-6) = 10^3 = 1000
        actualAmountIn = token1DecimalsNum >= 9
          ? amountInAdjusted * (10n ** BigInt(token1DecimalsNum - 9))
          : amountInAdjusted / (10n ** BigInt(9 - token1DecimalsNum));
        actualToken = token1;
      }

      // Skip if actual amount is zero or negative
      if (actualAmountIn <= 0n) return;

      // Calculate fees (fee is in DEX Lite format where 1% = 10000, so 100% = 1000000)
      // Ensure fee is reasonable (max ~0.8% = 8191 according to variables.sol)
      const feeNum = Number(fee);
      if (feeNum > 10000 || feeNum < 0) { // Max fee is ~1% 
        console.warn(`Invalid fee: ${feeNum} for token ${actualToken}`);
        return;
      }
      
      const feesCollected = (actualAmountIn * BigInt(feeNum)) / 1000000n; // fee/1000000 to get percentage
      
      // Add volume and fees
      dailyVolume.add(actualToken, actualAmountIn);
      dailyFees.add(actualToken, feesCollected);
    });
  };

  processDexLiteEvents(dexLiteSwapEvents);

  return { dailyVolume, dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2025-8-10' },
  },
};

export default adapter;
