import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

const methodology = {
  Fees: "Swap fees paid by users of 0.03%",
  UserFees: "Swap fees paid by users of 0.03%",
  Revenue: "30% of collected swap fees",
  ProtocolRevenue: "30% of collected swap fees",
  SupplySideRevenue:
    "70% of collected swap fees are distributed to liquidity providers",
};

const FACTORIES: TAddress = {
  [CHAIN.AVAX]: "0x3D193de151F8e4e3cE1C4CB2977F806663106A87",
  [CHAIN.BASE]: "0x4ccf7aa5736c5e8b6da5234d1014b5019f50cb56",
  [CHAIN.ETHEREUM]: "0x820c889D5749847217599B43ab86FcC91781019f",
};

const scaleFactor = BigInt(10000);
const factoryFee = BigInt(10); // 0.1%
const lpFee = BigInt(20); // 0.2%

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyVolume = options.createBalances();
  const totalVolume = options.createBalances();

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
    dailyFees.addGasToken(fee + protocolRevenue);
    dailyProtocolRevenue.addGasToken(protocolRevenue);
    dailySupplySideRevenue.addGasToken(fee);
    dailyVolume.addGasToken(nativeAmount);
  });

  return {
    dailyFees,
    dailyVolume,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapters: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: 1716868800,
      meta: {
        methodology,
      },
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: 1716868800,
      meta: {
        methodology,
      },
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: 1716868800,
      meta: {
        methodology,
      },
    },
  },
};

export default adapters;
