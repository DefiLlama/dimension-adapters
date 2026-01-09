import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const DEX_ADDRESS = "0xd263DC98dEc57828e26F69bA8687281BA5D052E0";
const QUERY_HELPER_ADDRESS = "0xf7b59E4f71E467C0e409609A4a0688b073C56142";

// Mapping of Althea L1 EVM addresses to Coingecko IDs and decimals
const ADDRESS_TO_TOKEN: { [key: string]: { coingeckoId: string; decimals: number } } = {
  "0x0000000000000000000000000000000000000000": { coingeckoId: "althea", decimals: 18 },
  "0x80b5a32e4f032b2a058b4f29ec95eefeeb87adcd": { coingeckoId: "usd-coin", decimals: 6 },
  "0xeceeeefcee421d8062ef8d6b4d814efe4dc898265": { coingeckoId: "tether", decimals: 6 },
  "0xd567b3d7b8fe3c79a1ad8da978812cfc4fa05e75": { coingeckoId: "usds", decimals: 18 },
  "0x5fd55a1b9fc24967c4db09c513c3ba0dfa7ff687": { coingeckoId: "susds", decimals: 18 },
  "0x1d54ecb8583ca25895c512a8308389ffd581f9c9": { coingeckoId: "graviton", decimals: 6 },
  "0xc03345448969dd8c00e9e4a85d2d9722d093af8e": { coingeckoId: "weth", decimals: 18 },
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const logs: any[] = await options.getLogs({
    target: DEX_ADDRESS,
    eventAbi: 'event Swap(address indexed user, address indexed base, address indexed quote, uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint128 minOutput, int128 baseFlow, int128 quoteFlow)'
  });

  const uniquePoolIdxs = new Set<number>();
  logs.forEach((log: any) => {
    uniquePoolIdxs.add(Number(log.poolIdx));
  });

  const feeRatesByIndex: { [key: number]: number } = {};
  for (const poolIdx of uniquePoolIdxs) {
    // Fetch fee rate for each poolIdx
    const result = await options.api.call({
      target: QUERY_HELPER_ADDRESS,
      abi: 'function queryPoolTemplate (uint256 poolIdx) public view returns (uint8 schema_, uint16 feeRate_, uint8 protocolTake_, uint16 tickSize_, uint8 jitThresh_, uint8 knockoutBits_, uint8 oracleFlags_)',
      params: [poolIdx],
    });
    const feeRate = result.feeRate_;
    // console.log(`Fetched fee rate for poolIdx ${poolIdx}: ${feeRate}`);

    // The fee rate is in hundredths of a basis point, so to convert to the fee rate as a decimal divide by 10,000,000
    feeRatesByIndex[poolIdx] = feeRate / 10000000;
  }
  logs.forEach((log: any) => {
    const baseAddress = log.base.toLowerCase();
    const quoteAddress = log.quote.toLowerCase();
    const baseToken = ADDRESS_TO_TOKEN[baseAddress];
    const quoteToken = ADDRESS_TO_TOKEN[quoteAddress];
    
    let feeRate = feeRatesByIndex[Number(log.poolIdx)];
    if (feeRate === undefined) {
      throw new Error(`Fee rate not found for poolIdx ${log.poolIdx}`);
    }

    // Handle the base token flow
    const baseFlow = log.baseFlow < 0n ? -log.baseFlow : log.baseFlow;
    const baseDecimals = baseToken ? baseToken.decimals : 18;
    const baseTokens = Number(baseFlow) / (10 ** baseDecimals);
    if (baseToken) {
      // console.log("Base:", baseToken.coingeckoId, " Base tokens:", baseTokens);
      dailyVolume.addCGToken(baseToken.coingeckoId, baseTokens);
    } else {
      // console.log("Base:", baseAddress, " Base tokens:", baseTokens);
      dailyVolume.add(baseAddress, baseFlow);
    }
    
    // Calculate fees on input token (negative flow)
    if (log.baseFlow < 0n && feeRate > 0) {
      const baseFeeRaw = (baseFlow * BigInt(Math.floor(feeRate * 10000))) / 10000n;
      const baseFee = Number(baseFeeRaw) / (10 ** baseDecimals);
      if (baseToken) {
        // console.log("Base tokens: ", baseTokens, " Base fee:", baseToken.coingeckoId, " Fee amount:", baseFee, " Fee rate:", feeRate);
        dailyFees.addCGToken(baseToken.coingeckoId, baseFee);
      } else {
        // console.log("Base fee:", baseAddress, " Fee amount:", baseFee, " Fee rate:", feeRate);
        dailyFees.add(baseAddress, baseFeeRaw);
      }
    }

    // Handle the quote token flow
    const quoteFlow = log.quoteFlow < 0n ? -log.quoteFlow : log.quoteFlow;
    const quoteDecimals = quoteToken ? quoteToken.decimals : 18;
    const quoteTokens = Number(quoteFlow) / (10 ** quoteDecimals);
    if (quoteToken) {
      // console.log("Quote:", quoteToken.coingeckoId, " Quote tokens:", quoteTokens);
      dailyVolume.addCGToken(quoteToken.coingeckoId, quoteTokens);
    } else {
      // console.log("Quote:", quoteAddress, " Quote tokens:", quoteTokens);
      dailyVolume.add(quoteAddress, quoteFlow);
    }

    
    // Calculate fees on input token (negative flow)
    if (log.quoteFlow < 0n && feeRate > 0) {
      const quoteFeeRaw = (quoteFlow * BigInt(Math.floor(feeRate * 10000))) / 10000n;
      const quoteFee = Number(quoteFeeRaw) / (10 ** quoteDecimals);
      if (quoteToken) {
        // console.log("Quote Tokens: ", quoteTokens, " Quote fee:", quoteToken.coingeckoId, " Fee amount:", quoteFee, " Fee rate:", feeRate);
        dailyFees.addCGToken(quoteToken.coingeckoId, quoteFee);
      } else {
        // console.log("Quote fee:", quoteAddress, " Fee amount:", quoteFee, " Fee rate:", feeRate);
        dailyFees.add(quoteAddress, quoteFeeRaw);
      }
    }

  });
  // console.log("Daily fees: ", dailyFees.getBalances());
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees, dailyProtocolRevenue: 0 }
}

const methodology = {
  Volume: "iFi (Infrastructure Finance) DEX trade volume",
  Fees: "Trading fees are paid by users",
  UserFees: "All fees on iFi DEX are paid by users",
  Revenue: "iFi DEX doesnt take any fee share",
  ProtocolRevenue: "iFi DEX doesnt take any fee share",
  SupplySideRevenue: "All the trading fees go to liquidity providers",
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ALTHEA_L1],
  start: '2025-10-07',
  methodology
}


export default adapter;
