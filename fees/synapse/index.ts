import { Adapter, BaseAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";

const TEN_BILLION = 10_000_000_000n;
const SWAP_STORAGE_ABI = "function swapStorage() view returns (uint256 initialA, uint256 futureA, uint256 initialATime, uint256 futureATime, uint256 swapFee, uint256 adminFee, address lpToken)";

const METRICS = {
  BRIDGE: "Bridge Fees",
  AMM_SWAP: "AMM Swap Fees",
  AMM_LIQUIDITY: "AMM Liquidity Fees",
  FLASHLOAN: "Flashloan Fees",
  CCTP: "CCTP Fees",
  MESSAGING: "Messaging Gas Fees",
  RFQ: "RFQ Bridge Fees",
};

const bridgeConfig: Record<string, { bridge: string; start: string }> = {
  [CHAIN.ETHEREUM]: { bridge: "0x2796317b0fF8538F253012862c06787Adfb8cEb6", start: "2021-08-16" },
  [CHAIN.OPTIMISM]: { bridge: "0xAf41a65F786339e7911F4acDAD6BD49426F2Dc6b", start: "2021-11-12" },
  [CHAIN.CRONOS]: { bridge: "0xE27BFf97CE92C3e1Ff7AA9f86781FDd6D48F5eE9", start: "2022-02-20" },
  [CHAIN.BSC]: { bridge: "0xd123f70AE324d34A9E76b67a27bf77593bA8749f", start: "2021-08-16" },
  [CHAIN.POLYGON]: { bridge: "0x8F5BBB2BB8c2Ee94639E55d5F41de9b4839C1280", start: "2021-08-16" },
  [CHAIN.FANTOM]: { bridge: "0xAf41a65F786339e7911F4acDAD6BD49426F2Dc6b", start: "2021-10-07" },
  [CHAIN.BOBA]: { bridge: "0x432036208d2717394d2614d6697c46DF3Ed69540", start: "2021-11-12" },
  [CHAIN.METIS]: { bridge: "0x06Fea8513FF03a0d3f61324da709D4cf06F42A5c", start: "2022-02-27" },
  [CHAIN.MOONBEAM]: { bridge: "0x84A420459cd31C3c34583F67E0f0fB191067D32f", start: "2022-01-11" },
  [CHAIN.MOONRIVER]: { bridge: "0xaeD5b25BE1c3163c907a471082640450F928DDFE", start: "2021-11-12" },
  [CHAIN.KLAYTN]: { bridge: "0xAf41a65F786339e7911F4acDAD6BD49426F2Dc6b", start: "2022-06-18" },
  [CHAIN.ARBITRUM]: { bridge: "0x6F4e8eBa4D337f874Ab57478AcC2Cb5BACdc19c9", start: "2021-09-12" },
  [CHAIN.AVAX]: { bridge: "0xC05e61d0E7a63D27546389B7aD62FdFf5A91aACE", start: "2021-08-25" },
  [CHAIN.DFK]: { bridge: "0xE05c976d3f045D0E6E7A6f61083d98A15603cF6A", start: "2022-03-25" },
  [CHAIN.AURORA]: { bridge: "0xaeD5b25BE1c3163c907a471082640450F928DDFE", start: "2021-12-27" },
  [CHAIN.HARMONY]: { bridge: "0xAf41a65F786339e7911F4acDAD6BD49426F2Dc6b", start: "2021-10-25" },
  // [CHAIN.CANTO]: { bridge: "0xDde5BEC4815E1CeCf336fb973Ca578e8D83606E0", start: "2022-10-05" },
  [CHAIN.BASE]: { bridge: "0xf07d1C752fAb503E47FEF309bf14fbDD3E867089", start: "2023-08-01" },
};

const ammPools: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: ["0x1116898DdA4015eD8dDefb84b6e8Bc24528Af2d8"],
  [CHAIN.OPTIMISM]: ["0xF44938b0125A6662f9536281aD2CD6c499F22004", "0xE27BFf97CE92C3e1Ff7AA9f86781FDd6D48F5eE9"],
  [CHAIN.CRONOS]: ["0xCb6674548586F20ca39C97A52A0ded86f48814De"],
  [CHAIN.BSC]: ["0x938aFAFB36E8B1AB3347427eb44537f543475cF9", "0x930d001b7efb225613aC7F35911c52Ac9E111Fa9", "0x28ec0B36F0819ecB5005cAB836F4ED5a2eCa4D13", "0x740B36494A5Ebe0F18f3e05f3a951ae292080d33"],
  [CHAIN.POLYGON]: ["0x3f52E42783064bEba9C1CFcD2E130D156264ca77", "0x96cf323E477Ec1E17A4197Bdcc6f72Bb2502756a", "0x85fCD7Dd0a1e1A9FCD5FD886ED522dE8221C3EE5"],
  [CHAIN.FANTOM]: ["0x080f6aed32fc474dd5717105dba5ea57268f46eb", "0x1f6A0656Ff5061930076bf0386b02091e0839F9f", "0x2913E812Cf0dcCA30FB28E6Cac3d2DCFF4497688", "0x85662fd123280827e11C59973Ac9fcBE838dC3B4", "0x8D9bA570D6cb60C7e3e0F31343Efe75AB8E65FB1"],
  [CHAIN.BOBA]: ["0x75FF037256b36F15919369AC58695550bE72fead", "0x753bb855c8fe814233d26Bb23aF61cb3d2022bE5"],
  [CHAIN.METIS]: ["0x555982d2E211745b96736665e19D9308B615F78e", "0x09fEC30669d63A13c666d2129230dD5588E2e240"],
  [CHAIN.KLAYTN]: ["0xfDbaD1699A550F933EFebF652a735F2f89d3833c"],
  [CHAIN.ARBITRUM]: ["0x3Ca625F5896e725840cCAb1Bbe2d62623eff865a", "0x84cd82204c07c67dF1C2C372d8Fd11B3266F76a3", "0x0Db3FE3B770c95A0B99D1Ed6F2627933466c0Dd8", "0x9Dd329F5411466d9e0C488fF72519CA9fEf0cb40", "0xa067668661C84476aFcDc6fA5D758C4c01C34352"],
  [CHAIN.AVAX]: ["0xE55e19Fb4F2D85af758950957714292DAC1e25B2", "0xF44938b0125A6662f9536281aD2CD6c499F22004", "0xED2a7edd7413021d440b09D654f3b87712abAB66", "0xA196a03653f6cc5cA0282A8BD7Ec60e93f620afc", "0x77a7e60555bC18B4Be44C181b2575eee46212d44"],
  [CHAIN.AURORA]: ["0xcEf6C2e20898C2604886b888552CA6CcF66933B0"],
  [CHAIN.HARMONY]: ["0x080F6AEd32Fc474DD5717105Dba5ea57268F46eb", "0x555982d2E211745b96736665e19D9308B615F78e", "0x3ea9B0ab55F34Fb188824Ee288CeaEfC63cf908e", "0x2913E812Cf0dcCA30FB28E6Cac3d2DCFF4497688", "0x00A4F57D926781f62D09bb05ec76e6D8aE4268da"],
  // [CHAIN.CANTO]: ["0xF60F88bA0CB381b8D8A662744fF93486273c22F9", "0x07379565cD8B0CaE7c60Dc78e7f601b34AF2A21c", "0x273508478e099Fdf953349e6B3704E7c3dEE91a5"],
  [CHAIN.BASE]: ["0x6223bD82010E2fB69F329933De20897e7a4C225f"],
};

const cctpContracts: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x12715a66773BD9C54534a01aBF01d05F6B4Bd35E",
  [CHAIN.OPTIMISM]: "0x12715a66773BD9C54534a01aBF01d05F6B4Bd35E",
  [CHAIN.POLYGON]: "0x12715a66773BD9C54534a01aBF01d05F6B4Bd35E",
  [CHAIN.ARBITRUM]: "0x12715a66773BD9C54534a01aBF01d05F6B4Bd35E",
  [CHAIN.AVAX]: "0x12715a66773BD9C54534a01aBF01d05F6B4Bd35E",
  [CHAIN.BASE]: "0x12715a66773BD9C54534a01aBF01d05F6B4Bd35E",
};

const messageBusContracts: Record<string, string> = {
  [CHAIN.AVAX]: "0xAe5C1c2E5778f40185A9580ACa4061B42De6f74B",
  [CHAIN.DFK]: "0x7bc5fD6b80067d6052A4550c69f152877bF7C748",
  [CHAIN.HARMONY]: "0x4F437be4A3448fCf394e513FC1A8EF92E190D1ba",
  [CHAIN.KLAYTN]: "0xaEe80e4B92Ba497aF1378Bc799687FBF816Ab87b",
};

// FastBridge / Synapse Intent Network (RFQ). https://github.com/synapsecns/sanguine/tree/master/packages/contracts-rfq
const fastBridgeContracts: Record<string, { contract: string; start: string }> = {
  [CHAIN.ETHEREUM]: { contract: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E", start: "2024-02-28" },
  [CHAIN.ARBITRUM]: { contract: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E", start: "2024-02-28" },
  [CHAIN.OPTIMISM]: { contract: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E", start: "2024-02-28" },
  [CHAIN.BASE]: { contract: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E", start: "2024-07-22" },
  [CHAIN.BSC]: { contract: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E", start: "2024-07-22" }
};

const bridgeFeeEvents = [
  "event TokenMint(address indexed to, address token, uint256 amount, uint256 fee, bytes32 indexed kappa)",
  "event TokenMintAndSwap(address indexed to, address token, uint256 amount, uint256 fee, uint8 tokenIndexFrom, uint8 tokenIndexTo, uint256 minDy, uint256 deadline, bool swapSuccess, bytes32 indexed kappa)",
  "event TokenWithdraw(address indexed to, address token, uint256 amount, uint256 fee, bytes32 indexed kappa)",
  "event TokenWithdrawAndRemove(address indexed to, address token, uint256 amount, uint256 fee, uint8 swapTokenIndex, uint256 swapMinAmount, uint256 swapDeadline, bool swapSuccess, bytes32 indexed kappa)",
];

const ammEvents = {
  swap: "event TokenSwap(address indexed buyer, uint256 tokensSold, uint256 tokensBought, uint128 soldId, uint128 boughtId)",
  add: "event AddLiquidity(address indexed provider, uint256[] tokenAmounts, uint256[] fees, uint256 invariant, uint256 lpTokenSupply)",
  removeImbalance: "event RemoveLiquidityImbalance(address indexed provider, uint256[] tokenAmounts, uint256[] fees, uint256 invariant, uint256 lpTokenSupply)",
  flashLoan: "event FlashLoan(address indexed receiver, uint8 tokenIndex, uint256 amount, uint256 amountFee, uint256 protocolFee)",
};

// CircleRequestFulfilled fires inside receiveCircleToken (the path that takes the fee) and carries
// both the mint token and the total fee.
const cctpFulfilledEvent = "event CircleRequestFulfilled(uint32 originDomain, address indexed recipient, address mintToken, uint256 fee, address token, uint256 amount, bytes32 requestID)";
const messageBusEvent = "event MessageSent(address indexed sender, uint256 srcChainID, bytes32 receiver, uint256 indexed dstChainId, bytes message, uint64 nonce, bytes options, uint256 fee, bytes32 indexed messageId)";

const fastBridgeEvent = "event BridgeRequested(bytes32 indexed transactionId, address indexed sender, bytes request, uint32 destChainId, address originToken, address destToken, uint256 originAmount, uint256 destAmount, bool sendChainGas)";
// `request` bytes encode the BridgeTransaction struct, which carries the protocol fee (originFeeAmount).
const FAST_BRIDGE_TX_TYPE = ["tuple(uint32 originChainId, uint32 destChainId, address originSender, address destRecipient, address originToken, address destToken, uint256 originAmount, uint256 destAmount, uint256 originFeeAmount, bool sendChainGas, uint256 deadline, uint256 nonce)"];
const fastBridgeCoder = ethers.AbiCoder.defaultAbiCoder();

const getAmmMetadata = async (options: FetchOptions, allPools: string[]) => {
  const tokenCalls = Array.from({ length: 8 }, (_, tokenIndex) => Promise.all(allPools.map((target) => options.api.call({
    target,
    abi: "function getToken(uint8) view returns (address)",
    params: tokenIndex,
    permitFailure: true,
  }))));

  const [allTokens, allStorage] = await Promise.all([
    Promise.all(tokenCalls) as Promise<string[][]>,
    Promise.all(allPools.map((target) => options.api.call({ target, abi: SWAP_STORAGE_ABI, permitFailure: true }))),
  ]);

  const pools: string[] = [], swapStorage: any[] = [], poolTokens = allTokens.map(() => [] as string[]);
  allStorage.forEach((storage, poolIndex) => {
    if (!storage) return;
    const nextIndex = pools.push(allPools[poolIndex]) - 1;
    swapStorage.push(storage);
    allTokens.forEach((tokens, tokenIndex) => poolTokens[tokenIndex][nextIndex] = tokens[poolIndex]);
  });
  return { pools, poolTokens, swapStorage };
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const addFee = (token: string, total: any, metric: string, protocol: any = total, supplySide?: any) => {
    dailyFees.add(token, total, metric);
    dailyUserFees.add(token, total, metric);
    dailyRevenue.add(token, protocol, metric);
    dailyProtocolRevenue.add(token, protocol, metric);
    if (supplySide !== undefined) dailySupplySideRevenue.add(token, supplySide, metric);
  };

  // Bridge contracts emit the exact per-transfer fee on mint/withdraw events:
  // https://contracts.synapseprotocol.com/bridge/mrsynapsebridge
  for (const eventAbi of bridgeFeeEvents) {
    const logs = await options.getLogs({ target: bridgeConfig[options.chain].bridge, eventAbi });
    logs.forEach((log: any) => addFee(log.token, log.fee, METRICS.BRIDGE));
  }

  const configuredPools = ammPools[options.chain] ?? [];
  if (configuredPools.length) {
    const { pools, poolTokens, swapStorage } = await getAmmMetadata(options, configuredPools);

    const addAmmFee = (poolIndex: number, tokenIndex: number, total: any, metric: string, explicitProtocol?: any) => {
      const token = poolTokens[tokenIndex]?.[poolIndex];
      const totalFee = BigInt(total ?? 0);
      if (!token || totalFee === 0n) return;

      const adminFee = BigInt(swapStorage[poolIndex]?.adminFee ?? 0);
      const protocol = explicitProtocol === undefined ? totalFee * adminFee / TEN_BILLION : BigInt(explicitProtocol);
      addFee(token, totalFee, metric, protocol, totalFee - protocol);
    };

    if (pools.length) {
      // StableSwap fees are split between LPs and the admin fee; see Synapse Swap docs:
      // https://contracts.synapseprotocol.com/amm/swap
      const swapLogs = await options.getLogs({ targets: pools, eventAbi: ammEvents.swap, flatten: false, onlyArgs: false });
      swapLogs.forEach((logs: any[], poolIndex: number) => {
        const swapFee = BigInt(swapStorage[poolIndex]?.swapFee ?? 0);
        logs.forEach((log: any) => addAmmFee(
          poolIndex,
          Number(log.args.boughtId),
          swapFee === 0n ? 0n : BigInt(log.args.tokensBought) * swapFee / (TEN_BILLION - swapFee),
          METRICS.AMM_SWAP,
        ));
      });

      for (const eventAbi of [ammEvents.add, ammEvents.removeImbalance]) {
        const logs = await options.getLogs({ targets: pools, eventAbi, flatten: false, onlyArgs: false });
        logs.forEach((poolLogs: any[], poolIndex: number) => poolLogs.forEach((log: any) => {
          (log.args.fees ?? []).forEach((fee: any, tokenIndex: number) => addAmmFee(poolIndex, tokenIndex, fee, METRICS.AMM_LIQUIDITY));
        }));
      }

      const flashLoanLogs = await options.getLogs({ targets: pools, eventAbi: ammEvents.flashLoan, flatten: false, onlyArgs: false });
      flashLoanLogs.forEach((logs: any[], poolIndex: number) => logs.forEach((log: any) => {
        addAmmFee(poolIndex, Number(log.args.tokenIndex), log.args.amountFee, METRICS.FLASHLOAN, log.args.protocolFee);
      }));
    }
  }

  const cctp = cctpContracts[options.chain];
  if (cctp) {
    // SynapseCCTP CircleRequestFulfilled carries the mint token and total fee directly
    // https://developers.circle.com/cctp/concepts/fees
    const logs = await options.getLogs({ target: cctp, eventAbi: cctpFulfilledEvent });
    logs.forEach((log: any) => addFee(log.mintToken, BigInt(log.fee), METRICS.CCTP));
  }

  const fastBridge = fastBridgeContracts[options.chain];
  if (fastBridge) {
    // FastBridge BridgeRequested: protocol fee = originFeeAmount (decoded from `request` bytes).
    const logs = await options.getLogs({ target: fastBridge.contract, eventAbi: fastBridgeEvent });
    logs.forEach((log: any) => {
      try {
        const [tx] = fastBridgeCoder.decode(FAST_BRIDGE_TX_TYPE, log.request);
        addFee(log.originToken, BigInt(tx.originFeeAmount), METRICS.RFQ);
      } catch { /* malformed request, skip */ }
    });
  }

  const messageBus = messageBusContracts[options.chain];
  if (messageBus) {
    // MessageBus MessageSent exposes `fee`, and withdrawGasFees withdraws accumulated native fees:
    // https://contracts.synapseprotocol.com/messaging/messagebus
    const logs = await options.getLogs({ target: messageBus, eventAbi: messageBusEvent });
    logs.forEach((log: any) => [dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue]
      .forEach((balance) => balance.addGasToken(log.fee, METRICS.MESSAGING)));
  }

  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const protocolBreakdown = {
  [METRICS.BRIDGE]: "Bridge settlement fees accrued in SynapseBridge fee balances for governance withdrawal.",
  [METRICS.AMM_SWAP]: "Admin share of StableSwap swap fees.",
  [METRICS.AMM_LIQUIDITY]: "Admin share of StableSwap liquidity fees.",
  [METRICS.FLASHLOAN]: "Protocol share emitted in SwapFlashLoan FlashLoan events.",
  [METRICS.CCTP]: "CCTP fee emitted by SynapseCCTP CircleRequestFulfilled events.",
  [METRICS.MESSAGING]: "MessageBus fees accumulated in native gas token and withdrawable through withdrawGasFees.",
  [METRICS.RFQ]: "FastBridge originFeeAmount accumulated as protocol fees on origin chain.",
};

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: Object.entries(bridgeConfig).reduce<BaseAdapter>((acc, [chain, { start }]) => ({ ...acc, [chain]: { start } }), {}),
  methodology: {
    UserFees: "Bridge, AMM, flash loan, CCTP, RFQ, and messaging fees paid by users and emitted by Synapse contracts.",
    Fees: "Bridge, AMM, flash loan, CCTP, RFQ, and messaging fees paid by users and emitted by Synapse contracts.",
    Revenue: "Bridge fees, AMM admin fees, flash loan protocol fees, CCTP protocol fees, FastBridge protocol fees, and MessageBus fees accrued to Synapse contracts.",
    ProtocolRevenue: "Bridge fees, AMM admin fees, flash loan protocol fees, CCTP protocol fees, FastBridge protocol fees, and MessageBus fees accrued to Synapse contracts.",
    SupplySideRevenue: "AMM LP share and flash loan LP share.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.BRIDGE]: "Bridge settlement fees emitted by SynapseBridge TokenMint, TokenMintAndSwap, TokenWithdraw, and TokenWithdrawAndRemove events.",
      [METRICS.AMM_SWAP]: "StableSwap swap fees calculated from TokenSwap events and pool swapFee settings.",
      [METRICS.AMM_LIQUIDITY]: "StableSwap add/remove liquidity imbalance fees emitted in pool liquidity events.",
      [METRICS.FLASHLOAN]: "Flash loan fees emitted by SwapFlashLoan FlashLoan events.",
      [METRICS.CCTP]: "CCTP fee emitted by SynapseCCTP CircleRequestFulfilled events.",
      [METRICS.MESSAGING]: "Native gas fees emitted by MessageBus MessageSent events.",
      [METRICS.RFQ]: "FastBridge protocol fee from BridgeRequested events.",
    },
    Revenue: protocolBreakdown,
    ProtocolRevenue: protocolBreakdown,
    SupplySideRevenue: {
      [METRICS.AMM_SWAP]: "LP share of StableSwap swap fees.",
      [METRICS.AMM_LIQUIDITY]: "LP share of StableSwap liquidity fees.",
      [METRICS.FLASHLOAN]: "LP share of flash loan fees.",
    },
  },
};

export default adapter;
