import { Chain } from "../../adapters/types";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";
import { METRIC } from "../../helpers/metrics";

const abis = {
  allTokens: "address[]:getAllTokens",
};

type TAddress = {
  [s: string | Chain]: string;
};

type Swap = {
  sender: string;
  amountTokenIn: string;
  amountNativeIn: string;
  amountTokenOut: string;
  amountNativeOut: string;
  flashSwap: boolean;
};

const FACTORIES: TAddress = {
  [CHAIN.AVAX]: "0x754A0c42C35562eE7a41eb824d14bc1259820f01",
  [CHAIN.BASE]: "0x10d11Eb1d5aB87E65518458F990311480b321061",
  [CHAIN.ETHEREUM]: "0x820c889D5749847217599B43ab86FcC91781019f",
};

const scaleFactor = BigInt(10000);
const factoryFee = BigInt(10); // 0.1%
const lpFee = BigInt(20); // 0.2%

export async function swapMetrics(options: FetchOptions): Promise<{
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailySupplySideRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailyVolume: Balances;
}> {
  const { createBalances } = options;
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyVolume = createBalances();
  const dailyRevenue = createBalances();

  const allTokens = await options.api.call({
    target: FACTORIES[options.chain],
    abi: abis.allTokens,
  });

  const logs = await options.getLogs({
    targets: allTokens,
    eventAbi:
      "event Swap(address indexed sender, uint256 amountTokenIn, uint256 amountNativeIn, uint256 amountTokenOut, uint256 amountNativeOut, bool flashSwap)",
  });

  logs.map((tx: Swap) => {
    const nativeAmount = BigInt(tx.amountNativeIn) + BigInt(tx.amountNativeOut);
    const fee = (nativeAmount * lpFee) / scaleFactor;
    const protocolRevenue = (nativeAmount * factoryFee) / scaleFactor;
    dailyFees.addGasToken(fee, METRIC.LP_FEES);
    dailyFees.addGasToken(protocolRevenue, METRIC.PROTOCOL_FEES);
    dailyRevenue.addGasToken(protocolRevenue, METRIC.PROTOCOL_FEES);
    dailyProtocolRevenue.addGasToken(protocolRevenue, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addGasToken(fee, METRIC.LP_FEES);
    dailyVolume.addGasToken(nativeAmount);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyVolume,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}
