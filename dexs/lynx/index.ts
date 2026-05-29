import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

// https://lynx-finance.gitbook.io/lynx-finance
const FRACTION_SCALE = 100000n;
const LEVERAGE_SCALE = 100n;

const abis = {
  FeeRegistered:
    "event FeeRegistered(bytes32 indexed positionId, address indexed token, uint8 indexed feeType, uint256 amount)",
  FeesCharged:
    "event FeesCharged(bytes32 indexed positionId, address indexed trader, uint16 indexed pairId, (uint256 collateral, uint32 leverage, bool long, uint64 openPrice, uint64 tp) positionRegistrationParams, int256 profitPrecision, uint256 interest, int256 funding, uint256 closingFee, uint256 tradeValue)",
  PerformanceFeeCharging:
    "event PerformanceFeeCharging(bytes32 indexed positionId, uint256 performanceFee)",
  ProtocolFundingShareAccrued:
    "event ProtocolFundingShareAccrued(uint16 indexed pairId, uint256 protocolFundingShare)",
  decimals: "uint8:decimals",
  lexPartF: "function lexPartF() view returns (uint32)",
  liquidationThresholdF: "function liquidationThresholdF() view returns (uint32)",
};

const config: Record<string, {
  tradingFloor: string;
  // engineChip / oftChip → underlying token
  chipToToken: Record<string, string>;
  // PoolAccountant → underlying token
  poolAccountants: Record<string, string>;
}> = {
  [CHAIN.SONIC]: {
    tradingFloor: "0x37792EecFA985D0b00a51864c970e7df406AA868",
    chipToToken: {
      "0x0e7a7a477ab4ddfb2d7a500d33c38a19372a70fc": ADDRESSES.sonic.wS,                           // wSONIC
      "0x4461913eca88ede2d76b576c8fa5d08535bb714a": "0x005851f943ee2957b1748957f26319e4f9edebc1", // AG
      "0xb02bd75a0814585ba7c4d5a1c421b092adf96da0": ADDRESSES.sonic.USDC_e,                       // USDC
      "0x8a5e46c8de8c301201af475dbef7cf4fa6cc71f2": "0xbf5899166ac476370b3117c9256b7fc45624f4ea", // GFI
      "0x1444e226a93ee7228a7634d3101413a4d1aea4bd": "0x7a0c53f7eb34c5bc8b01691723669ada9d6cb384", // BOO
      "0x443d0a82de44fdf8236d40d72a40486c804764b9": "0xa95ea1cfabccf0e9eb94b646cefe9ed71ff5d605", // xBOO
      "0xb0d87b27282501e64ffa575aaed393c373ee24b8": "0xa04bc7140c26fc9bb1f36b1a604c7a5a88fb0e70", // SWPx
      "0x73c0eea1fadd305d9a7e0a4c8943b16adff0a04a": ADDRESSES.sonic.scUSD,                       // scUSD
      "0x4a6132bb6a3c001937581822479474f2ae4c855d": "0x9f0df7799f6fdad409300080cff680f5a23df4b1", // wOS
      "0x5e9aac66c5cf0d1035f9213a2de323afca19653a": ADDRESSES.sonic.STS,                          // stS
      "0x83e2e4ca591c7f1f77588c684a83a0b5c92ac377": "0x71e99522ead5e21cf57f1f542dc4ad2e841f7321", // METRO
      "0x1423d2dc2a8e884b4535b349ad4b724b9a6f0fa1": "0x6c9b3a74ae4779da5ca999371ee8950e8db3407f", // FLY
      "0xaec5a1f07b459c50a0dfd5001798dc8b683b6023": "0xe6cc4d855b4fd4a9d02f46b9adae4c5efb1764b5", // LUDWIG
      "0xd50995818ac9e1fa49eed8e560a42bc5970a7c61": "0xb4444468e444f89e1c2cac2f1d3ee7e336cbd1f5", // RZR
      "0x4ff9415edd1d0d16b7d5c4b846f977733632d1fa": "0x4ff9415edd1d0d16b7d5c4b846f977733632d1fa", // wsuperOETHb
      "0x52947172802a5f2b14460db51ab212f89ceca31e": "0x52947172802a5f2b14460db51ab212f89ceca31e", // POKT
      "0x6ceef1cede82ee8a107da3b4fb71599af9ad3e06": "0x6ceef1cede82ee8a107da3b4fb71599af9ad3e06", // BTCB
      "0x2df8eca194cd938df350b146dea412874084cfac": "0x2df8eca194cd938df350b146dea412874084cfac", // wBNB
      "0x8fd2d0960ac7b312a4f799caa5dc17e9cfc4a7f3": "0x8fd2d0960ac7b312a4f799caa5dc17e9cfc4a7f3", // USDT
      "0x04a6f475a06d167359139647955a15d145e458e2": "0x04a6f475a06d167359139647955a15d145e458e2", // CELO
      "0x649e67480de2fef6bac4060bd52e476ea52f9889": "0x649e67480de2fef6bac4060bd52e476ea52f9889", // USDT (2)
      "0xb662013facfe49f11cfd990c5930caaccd24a9e7": "0xb662013facfe49f11cfd990c5930caaccd24a9e7", // ARB
      "0x43e57080f180ad6599853097ce2053d71a4a3d0c": "0x43e57080f180ad6599853097ce2053d71a4a3d0c", // weETH
      "0xa5396e8114cf8e2750e7e292a2c7db833088b0c3": "0xa5396e8114cf8e2750e7e292a2c7db833088b0c3", // ATH
      "0x1abb65ec27a7550a1012815b1f92d5bea387454c": "0x1abb65ec27a7550a1012815b1f92d5bea387454c", // WPOL
    },
    poolAccountants: {
      "0xf66333f844a04dae628bd0cb5bc67f7b2f51f528": ADDRESSES.sonic.wS,                           // wSONIC
      "0xf4969e3de3b8bf1f6f3661cea16a9143aff5b32d": "0x005851f943ee2957b1748957f26319e4f9edebc1", // AG
      "0x02b06017b1fa2c512361d61389f0a0c03f212074": ADDRESSES.sonic.USDC_e,                       // USDC
      "0x1d9c9b4f7090384063bebe8bf7161395c12afdce": "0xbf5899166ac476370b3117c9256b7fc45624f4ea", // GFI
      "0x0ee4421a0417167272c18a982cd733e3fde4dfc3": "0x7a0c53f7eb34c5bc8b01691723669ada9d6cb384", // BOO
      "0xad50e2e3001adf500d4b867fd215b66a8ac36ded": "0xa95ea1cfabccf0e9eb94b646cefe9ed71ff5d605", // xBOO
      "0xe25a452ec2c43276e9be1c34b5f1c7dee25c7110": "0xa04bc7140c26fc9bb1f36b1a604c7a5a88fb0e70", // SWPx
      "0x6f795c31295f97147e34eb26867a70cf353176b8": ADDRESSES.sonic.scUSD,                       // scUSD
      "0x258223246ee23829e351db865cfcad73c4a7b736": "0x9f0df7799f6fdad409300080cff680f5a23df4b1", // wOS
      "0x8c48c26abea37d1a2e41464f8aac7e9669976cca": ADDRESSES.sonic.STS,                          // stS
      "0x7f138d3101679eb45403e96f137a25fcd5c3631b": "0x71e99522ead5e21cf57f1f542dc4ad2e841f7321", // METRO
      "0x2fdc4a865d890f5d6e860a014d97a1e53387d831": "0x6c9b3a74ae4779da5ca999371ee8950e8db3407f", // FLY
      "0x19f0afc0b3a3a2c08e07dbc1ba511b071fa2ef51": "0xe6cc4d855b4fd4a9d02f46b9adae4c5efb1764b5", // LUDWIG
      "0x95340352059c0cc37903dd22011456b90d86aa32": "0xb4444468e444f89e1c2cac2f1d3ee7e336cbd1f5", // RZR
      "0xd5191a61d2c099aa976a989b5f3bde7d54c771b5": "0x4ff9415edd1d0d16b7d5c4b846f977733632d1fa", // wsuperOETHb
      "0x2b62ab0992c66142ac54843811fb143b239ec189": "0x52947172802a5f2b14460db51ab212f89ceca31e", // POKT
      "0x76dc33b8491ed1ae06218cc611be7fe5c63eff4d": "0x6ceef1cede82ee8a107da3b4fb71599af9ad3e06", // BTCB
      "0x97455887e04c9f7ab3e3a098f6a70dcfb43a2f24": "0x2df8eca194cd938df350b146dea412874084cfac", // wBNB
      "0xc0f9b8c83bf3dc1f0cc4eb7ff563b8e48802ea86": "0x8fd2d0960ac7b312a4f799caa5dc17e9cfc4a7f3", // USDT
      "0xc84bc3b4045c4b29eaa6adfbfbef1b4907e74f3d": "0x04a6f475a06d167359139647955a15d145e458e2", // CELO
      "0xa083167a3825d9ed0a2e23d5da062b2e09baab4e": "0x649e67480de2fef6bac4060bd52e476ea52f9889", // USDT (2)
      "0xec6b7b1e61ef20d674ba8ecaca46b4608eccafaf": "0xb662013facfe49f11cfd990c5930caaccd24a9e7", // ARB
      "0x81d4c25984dd6b4a010930ddd976faf028366164": "0x43e57080f180ad6599853097ce2053d71a4a3d0c", // weETH
      "0xc70f87d6b8f1d4ac6f18404b59e6630c44c71a61": "0xa5396e8114cf8e2750e7e292a2c7db833088b0c3", // ATH
      "0xf7e3d35f33329ff42141a3f45ff92eba0bb7c4ab": "0x1abb65ec27a7550a1012815b1f92d5bea387454c", // WPOL
    },
  },
  [CHAIN.BOBA]: {
    tradingFloor: "0x87525b5542DbF7302cd95D82388d28e44ec9289D",
    chipToToken: {
      "0xcdd339d704fb8f35a3a2f7d9b064238d33dc7550": ADDRESSES.boba.USDC,                          // USDC
      "0x9beabd8699e2306c5632c80e663de9953e104c3f": ADDRESSES.boba.BOBA,                           // BOBA
      "0x222a41942ac89533c77cc0c7c185e056cda76e2e": "0x52e4d8989fa8b3e1c06696e7b16def5d7707a0d1", // bobaETH
    },
    poolAccountants: {
      "0xae3a03686ac3a05b91cb1c2fbda88b6ad0b5d06e": ADDRESSES.boba.BOBA,                           // BOBA
      "0xe37429b035811edd4e9cc90b1025aaa50500e52a": ADDRESSES.boba.USDC,                          // USDC
      "0x09b87d341af5016054fd5211698bb5e47ae34dce": "0x52e4d8989fa8b3e1c06696e7b16def5d7707a0d1", // bobaETH
    },
  },
  [CHAIN.FLARE]: {
    tradingFloor: "0x37792EecFA985D0b00a51864c970e7df406AA868",
    chipToToken: {
      "0xc87c523964f20ebda30dea111f9748e682e801ef": ADDRESSES.flare.WFLR,                          // wFLR
    },
    poolAccountants: {
      "0x1104c3a65f3f830205993198aeb472c35ac9a414": ADDRESSES.flare.WFLR,                          // wFLR
    },
  },
};

function toUnderlying(chipAmount: bigint, chipDec: number, underlyingDec: number): bigint {
  if (chipDec === underlyingDec) return chipAmount;
  return chipAmount / BigInt(10 ** (chipDec - underlyingDec));
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const { tradingFloor, chipToToken, poolAccountants } = config[options.chain];
  const paAddresses = Object.keys(poolAccountants);
  const paTokens = Object.values(poolAccountants);
  const chipAddresses = Object.keys(chipToToken);
  const underlyingTokens = Object.values(chipToToken);
  const allTokens = [...new Set([...underlyingTokens, ...paTokens])];

  // Read chip decimals, underlying token decimals, per-PA lexPartF, and liquidation threshold
  const [chipDecArr, tokenDecArr, lexPartFs, liqThresholds]: [number[], number[], string[], string[]] = await Promise.all([
    options.api.multiCall({ abi: abis.decimals, calls: chipAddresses }),
    options.api.multiCall({ abi: abis.decimals, calls: allTokens }),
    options.api.multiCall({ abi: abis.lexPartF, calls: paAddresses }),
    options.api.multiCall({ abi: abis.liquidationThresholdF, calls: paAddresses }),
  ]);

  const chipDec: Record<string, number> = {};
  chipAddresses.forEach((c, i) => (chipDec[c] = Number(chipDecArr[i])));

  const tokenDec: Record<string, number> = {};
  allTokens.forEach((t, i) => (tokenDec[t] = Number(tokenDecArr[i])));

  // Map chip → lexPartF by finding which PA shares the same underlying token
  const chipToLexPartF: Record<string, bigint> = {};
  for (const [chip, underlying] of Object.entries(chipToToken)) {
    const paIdx = paTokens.indexOf(underlying);
    chipToLexPartF[chip] = paIdx >= 0 ? BigInt(lexPartFs[paIdx]) : 0n;
  }

  // Opening/Closing/Trigger fees from TradingFloor
  const feeEvents = await options.getLogs({
    target: tradingFloor,
    eventAbi: abis.FeeRegistered,
  });

  feeEvents.forEach((e: any) => {
    const chip = e.token.toLowerCase();
    const token = chipToToken[chip];
    if (!token) return;
    const chipDecimals = chipDec[chip];
    const tokenDecimals = tokenDec[token];
    const amount = toUnderlying(BigInt(e.amount), chipDecimals, tokenDecimals);
    const feeType = Number(e.feeType);

    if (feeType === 1 || feeType === 2) {
      dailyFees.add(token, amount, METRIC.OPEN_CLOSE_FEES);
      const lexPartF = chipToLexPartF[chip];
      const lpPart = (amount * lexPartF) / FRACTION_SCALE;
      dailySupplySideRevenue.add(token, lpPart, METRIC.LP_FEES);
      dailyRevenue.add(token, amount - lpPart, METRIC.PROTOCOL_FEES);
    } else if (feeType === 3) {
      dailyFees.add(token, amount, "Trigger Bot Fees");
      dailySupplySideRevenue.add(token, amount, "Trigger Bot Fees");
    }
  });

  // Volume + Borrowing fees + Performance fees + Funding fees from PoolAccountants
  const [feesChargedByPA, perfFeesByPA, fundingFeesByPA] = await Promise.all([
    options.getLogs({ targets: paAddresses, eventAbi: abis.FeesCharged, flatten: false }),
    options.getLogs({ targets: paAddresses, eventAbi: abis.PerformanceFeeCharging, flatten: false }),
    options.getLogs({ targets: paAddresses, eventAbi: abis.ProtocolFundingShareAccrued, flatten: false }),
  ]);

  paAddresses.forEach((_, i) => {
    const token = paTokens[i];
    const paChip = chipAddresses.find((c) => chipToToken[c] === token)!;
    const chipDecimals = chipDec[paChip];
    const tokenDecimals = tokenDec[token];
    const liqThresholdF = BigInt(liqThresholds[i]);

    (feesChargedByPA[i] || []).forEach((e: any) => {
      const params = e.positionRegistrationParams;
      const collateral = BigInt(params.collateral ?? params[0]);
      const leverage = BigInt(params.leverage ?? params[1]);
      dailyVolume.add(token, toUnderlying((collateral * leverage) / LEVERAGE_SCALE, chipDecimals, tokenDecimals));

      const interest = BigInt(e.interest);
      if (interest > 0n) {
        const borrowFee = toUnderlying(interest, chipDecimals, tokenDecimals);
        dailyFees.add(token, borrowFee, METRIC.BORROW_INTEREST);
        dailySupplySideRevenue.add(token, borrowFee, METRIC.BORROW_INTEREST);
      }

      // Liquidation
      const tradeValue = BigInt(e.tradeValue);
      if (tradeValue === 0n && collateral > 0n) {
        const liqFee = collateral * (FRACTION_SCALE - liqThresholdF) / FRACTION_SCALE;
        const liqFeeConverted = toUnderlying(liqFee, chipDecimals, tokenDecimals);
        dailyFees.add(token, liqFeeConverted, METRIC.LIQUIDATION_FEES);
        dailySupplySideRevenue.add(token, liqFeeConverted, METRIC.LIQUIDATION_FEES);
      }
    });

    (perfFeesByPA[i] || []).forEach((e: any) => {
      const perfFee = toUnderlying(BigInt(e.performanceFee), chipDecimals, tokenDecimals);
      dailyFees.add(token, perfFee, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(token, perfFee, METRIC.PERFORMANCE_FEES);
    });

    // Funding fees: LP/reserve portion of funding rate payments
    (fundingFeesByPA[i] || []).forEach((e: any) => {
      const fundingShare = toUnderlying(BigInt(e.protocolFundingShare), chipDecimals, tokenDecimals);
      dailyFees.add(token, fundingShare, "Funding Fees");
      dailySupplySideRevenue.add(token, fundingShare, "Funding Fees");
    });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SONIC]: { fetch, start: "2024-12-20" },
    [CHAIN.BOBA]: { fetch, start: "2024-07-14" },
    [CHAIN.FLARE]: { fetch, start: "2024-12-23" },
  },
  methodology: {
    Volume:
      "Notional value of settled perpetual trades (collateral x leverage). Includes Regular Mode (2-249x), Cat Mode (250-500x), and Up/Down Options.",
    Fees:
      "Opening/closing fees (percentage of position size, varies by collateral asset and instrument), borrow interest (floating rate on utilized amount), performance fees (percentage of profit on winning Cat Mode/Options trades), funding fees (LP/reserve portion of funding rate payments from the heavier OI side), liquidation fees (remaining collateral after 85% loss threshold), and trigger bot fees. Excludes artificial spread (built into entry price).",
    Revenue:
      "Protocol share of open/close fees (1 - lexPartF) plus performance fees on profitable Cat Mode and Options trades.",
    ProtocolRevenue:
      "Protocol share of open/close fees (1 - lexPartF) plus performance fees on profitable Cat Mode and Options trades.",
    UserFees: "All fees are paid by traders.",
    SupplySideRevenue:
      "Borrow interest (100% to LexPool LPs), LP share of open/close fees (per-pool lexPartF ratio), funding fees (LP/reserve portion diverted from funding rate payments), liquidation fees (remaining collateral sent to liquidity pool), and trigger fees to keeper bots.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.OPEN_CLOSE_FEES]:
        "Percentage of position size charged on open and close for Regular Mode (2-249x) trades. Fee rate varies by collateral asset and traded instrument. Cat Mode and Options do not pay open/close fees.",
      [METRIC.BORROW_INTEREST]:
        "Floating borrow rate charged on the utilized amount (collateral x take-profit target) while a position is open. Rate increases with pool utilization and is updated per block.",
      [METRIC.PERFORMANCE_FEES]:
        "Percentage of profit charged on winning Cat Mode (250-500x) and Up/Down Options trades. 0% on losing trades. A minimum cost applies if the fee is below the platform threshold.",
      "Trigger Bot Fees":
        "Execution fees paid to keeper bots for limit orders, stop-losses, take-profits, and liquidations.",
      [METRIC.LIQUIDATION_FEES]:
        "When losses reach 85% of collateral (liquidationThresholdF), the position is liquidated and the remaining ~15% of collateral is taken as a fee.",
      "Funding Fees":
        "LP/reserve portion of funding rate payments. The heavier OI side pays funding; a portion is diverted to the liquidity pool and reserve fund as risk compensation.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]:
        "Protocol treasury share of open/close fees (1 - lexPartF).",
      [METRIC.PERFORMANCE_FEES]:
        "Performance fees from profitable Cat Mode and Options trades.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]:
        "LexPool LP share of open/close fees, set per pool by the on-chain lexPartF parameter.",
      [METRIC.BORROW_INTEREST]:
        "100% of borrow interest goes to LexPool LPs as compensation for supplying trading liquidity.",
      "Trigger Bot Fees":
        "Execution fees paid to keeper bots.",
      [METRIC.LIQUIDATION_FEES]:
        "Remaining collateral (~15%) from liquidated positions, sent to the liquidity pool.",
      "Funding Fees":
        "LP/reserve portion of funding rate payments diverted to the liquidity pool as risk compensation.",
    },
  },
};

export default adapter;
