import { Chain } from "../../adapters/types";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type Contract = {
  [c: string | Chain]: {
    yBridge: string,
    xyRouter: string,
  };
}

const contract: Contract = {
  [CHAIN.ETHEREUM]: {
    yBridge: '0x4315f344a905dC21a08189A117eFd6E1fcA37D57',
    xyRouter: "0xFfB9faf89165585Ad4b25F81332Ead96986a2681"
  },
  [CHAIN.SCROLL]: {
    yBridge: "0x778C974568e376146dbC64fF12aD55B2d1c4133f",
    xyRouter: "0x22bf2A9fcAab9dc96526097318f459eF74277042"
  },
  [CHAIN.MANTLE]: {
    yBridge: "0x73Ce60416035B8D7019f6399778c14ccf5C9c7A1",
    xyRouter: "0x52075Fd1fF67f03beABCb5AcdA9679b02d98cA37"
  },
  [CHAIN.LINEA]: {
    yBridge: "0x73Ce60416035B8D7019f6399778c14ccf5C9c7A1",
    xyRouter: "0xc693C8AAD9745588e95995fef4570d6DcEF98000"
  },
  [CHAIN.BASE]: {
    yBridge: "0x73Ce60416035B8D7019f6399778c14ccf5C9c7A1",
    xyRouter: "0x6aCd0Ec9405CcB701c57A88849C4F1CD85a3f3ab"
  },
  [CHAIN.ARBITRUM]: {
    yBridge: "0x33383265290421C704c6b09F4BF27ce574DC4203",
    xyRouter: "0x062b1Db694F6A437e3c028FC60dd6feA7444308c"
  },
  [CHAIN.ERA]: {
    yBridge: "0xe4e156167cc9C7AC4AbD8d39d203a5495F775547",
    xyRouter: "0x30E63157bD0bA74C814B786F6eA2ed9549507b46"
  },
  [CHAIN.BSC]: {
    yBridge: "0x7D26F09d4e2d032Efa0729fC31a4c2Db8a2394b1",
    xyRouter: "0xDF921bc47aa6eCdB278f8C259D6a7Fef5702f1A9"
  },
  [CHAIN.POLYGON]: {
    yBridge: "0x0c988b66EdEf267D04f100A879db86cdb7B9A34F",
    xyRouter: "0xa1fB1F1E5382844Ee2D1BD69Ef07D5A6Abcbd388"
  },
  [CHAIN.KLAYTN]: {
    yBridge: "0x52075Fd1fF67f03beABCb5AcdA9679b02d98cA37",
    xyRouter: "0x252eA5AebEB648e7e871DAD7E0aB6cb49096BdD5"
  },
  [CHAIN.POLYGON_ZKEVM]: {
    yBridge: "0x3689D3B912d4D73FfcAad3a80861e7caF2d4F049",
    xyRouter: "0x218Ef86b88765df568E9D7d7Fd34B5Dc88098080"
  },
  [CHAIN.AVAX]: {
    yBridge: "0x2C86f0FF75673D489b7D72D9986929a2b0Ed596C",
    xyRouter: "0xa0c0F962DECD78D7CDE5707895603CBA74C02989"
  },
  [CHAIN.OPTIMISM]: {
    yBridge: "0x7a6e01880693093abACcF442fcbED9E0435f1030",
    xyRouter: "0xF8d342db903F266de73B10a1e46601Bb08a3c195"
  },
  [CHAIN.CRONOS]: {
    yBridge: "0xF103b5B479d2A629F422C42bb35E7eEceE1ad55E",
    xyRouter: "0x5d6e7E537cb4a8858C8B733A2A307B4aAFDc42ca"
  },
  [CHAIN.FANTOM]: {
    yBridge: "0xDa241399697fa3F6cD496EdAFab6191498Ec37F5",
    xyRouter: "0x1E1a70eDb9cd26ccc05F01C66B882cef0E4f7d2D"
  },
  [CHAIN.ASTAR]: {
    yBridge: "0x5C6C12Fd8b1f7E60E5B60512712cFbE0192E795E",
    xyRouter: "0x9c83E6F9E8DA12af8a0Cb8E276b722EB3D7668aF"
  },
  [CHAIN.KCC]: {
    yBridge: "0x7e803b54295Cd113Bf48E7f069f0531575DA1139",
    xyRouter: "0x562afa22b2Fc339fd7Fa03E734E7008C3EccF8CF"
  },
  [CHAIN.MOONRIVER]: {
    yBridge: "0xc67Dd7054915a2B0aA3e48f35DA714Ff861e71BD",
    xyRouter: "0x64d17beaE666cC435B9d40a21f058b379b2a0194"
  },
  [CHAIN.THUNDERCORE]: {
    yBridge: "0xF103b5B479d2A629F422C42bb35E7eEceE1ad55E",
    xyRouter: "0xbF26ca7cf925e9EA0765c737B066253CF80e0E09"
  },
  [CHAIN.NUMBERS]: {
    yBridge: "",
    xyRouter: "0x1acCfC3a45313f8F862BE7fbe9aB25f20A93d598"
  },
  [CHAIN.WEMIX]: {
    yBridge: "0x73Ce60416035B8D7019f6399778c14ccf5C9c7A1",
    xyRouter: "0x6471fAd467ac2854b403e7FE3e95FBbB3287a7ee"
  },
  [CHAIN.BLAST]: {
    yBridge: "0x73Ce60416035B8D7019f6399778c14ccf5C9c7A1",
    xyRouter: "0x43A86823EBBe2ECF9A384aDfD989E26A30626458"
  },
  // [CHAIN.XLAYER]: {
  //   yBridge: "0x6be1fe9dd10a4fbfce5552ca9add122341ec6c04",
  //   xyRouter: "0x6A816cEE105a9409D8df0A83d8eeaeD9EB4309fE"
  // },
  [CHAIN.TAIKO]: {
    yBridge: "0x6be1fe9dd10a4fbfce5552ca9add122341ec6c04",
    xyRouter: "0xedC061306A79257f15108200C5B82ACc874C239d"
  },
  [CHAIN.CRONOS_ZKEVM]: {
    yBridge: "0xE22747472A565e96D0867741811193895b9538f2",
    xyRouter: "0x986138f6ed1350a85De6B18280f7d139F74B7282"
  },
}
const yBridgeContractTopic = '0xb0e9a29a6096a927bd389ba0d0d1a15f82df21a331d23a33eeb7de1cf7ab2684'
const xyRouterContractTopic = '0xcfdc06da1b80f541716b9dc11dba02141fbc401b0d152e9286df44c79b9d4000'
const yBridgeContractEventAbi = 'event SwapRequested(uint256 _swapId, address indexed _aggregatorAdaptor, tuple(uint32 dstChainId, address dstChainToken, address dstAggregatorAdaptor, uint256 expectedDstChainTokenAmount, uint32 slippage) _dstChainDesc, address _srcToken, address indexed _vaultToken, uint256 _vaultTokenAmount, address _receiver, uint256 _srcTokenAmount, uint256 _expressFeeAmount, address indexed _referrer)'
const xyRouterContractEventAbi = `event XYRouterRequested(
        uint256 xyRouterRequestId,
        address indexed sender,
        address srcToken,
        uint256 amountIn,
        address indexed bridgeAddress,
        address bridgeToken,
        uint256 bridgeAmount,
        uint256 dstChainId,
        bytes bridgeAssetReceiver,
        tuple(
          tuple(bool hasTip, address tipReceiver) tipInfo,
          tuple(
            bool hasDstChainSwap,
            tuple(
              tuple(address srcToken, address dstToken, uint256 minReturnAmount, address receiver) swapRequest,
              address dexAddress,
              address approveToAddress,
              bytes dexCalldata
            ) swapAction
          ) dstChainSwapInfo,
          tuple(bool hasIM, address xApp, address refundReceiver, bytes message) imInfo
        ) dstChainAction,
        address indexed affiliate)`

const fetch: any = async (timestamp: number, _, { chain, getLogs, createBalances, getFromBlock, getToBlock }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume  = createBalances();
  try {
    const yBridgeContract = contract[chain].yBridge;
    const xyRouterContract = contract[chain].xyRouter;

    const logPromises: (Promise<any[]>)[] = [];
    if (yBridgeContract) {
      logPromises.push(getLogs({
        target: yBridgeContract,
        topics: [yBridgeContractTopic],
        eventAbi: yBridgeContractEventAbi,
      }))
    }
    if (xyRouterContract) {
      logPromises.push(getLogs({
        target: xyRouterContract,
        topics: [xyRouterContractTopic],
        eventAbi: xyRouterContractEventAbi,
      }))
    }
    const [yBridgeData, xyRouterData] = await Promise.all(logPromises);
    yBridgeData?.forEach((e: any) => {
      dailyVolume.add(e._vaultToken, e._vaultTokenAmount)
    });

    xyRouterData?.forEach((e: any) => {
      dailyVolume.add(e.bridgeToken, e.bridgeAmount);
    });
  } catch (error) {
    console.error(`XY Finance fetch chain ${chain} error: ${JSON.stringify(error)}`);
  } finally {
    return { dailyBridgeVolume: dailyVolume , timestamp, } as any;
  }
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(contract).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: '2023-08-10', }
    }
  }, {})
}

export default adapter
