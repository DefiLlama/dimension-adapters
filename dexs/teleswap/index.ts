import { BaseAdapter, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface ChainConfig {
  burnRouter: string;
  exchangeRouter: string;
  transferRouter: string;
  teleBTC: string;
  startDate: string;
}

interface UnwrapEvent {
  inputToken: string;
  amounts: [number, number, number];
  fees: [number, number, number, number];
}

interface WrapEvent {
  amounts: [number, number];
  fees: [number, number, number, number];
}

interface WrapAndSwapV1Event {
  inputAndOutputToken: [string, string];
  inputAndOutputAmount: [number, number];
  fees: [number, number, number, number, number];
}

interface WrapAndSwapV2Event {
  inputIntermediaryOutputToken: [string, string, string];
  inputIntermediaryOutputAmount: [number, number, number];
  fees: [number, number, number, number, number];
}

// Configuration
const CHAIN_CONFIGS: Partial<Record<CHAIN, ChainConfig>> = {
  [CHAIN.POLYGON]: {
    burnRouter: "0x0009876C47F6b2f0BCB41eb9729736757486c75f",
    exchangeRouter: "0xD1E9Ff33EC28f9Dd8D99E685a2B0F29dCaa095a3",
    transferRouter: "0x04367D74332137908BEF9acc0Ab00a299A823707",
    teleBTC: "0x3BF668Fe1ec79a84cA8481CEAD5dbb30d61cC685",
    startDate: "2024-01-01",
  },
  [CHAIN.BSC]: {
    burnRouter: "0x2787D48e0B74125597DD479978a5DE09Bb9a3C15",
    exchangeRouter: "0xcA5416364720c7324A547d39b1db496A2DCd4F0D",
    transferRouter: "0xA38aD0d52B89C20c2229E916358D2CeB45BeC5FF",
    teleBTC: "0xC58C1117DA964aEbe91fEF88f6f5703e79bdA574",
    startDate: "2024-01-01",
  },
  [CHAIN.BOB]: {
    burnRouter: "0x754DC006F4a748f80CcaF27C0efBfF412e54160D",
    exchangeRouter: "0xd724e5709dF7DC4B4dDd14B644118774146b9492",
    transferRouter: "0x25BEf4b1Ca5985661657B3B71f29c0994C36Bbba",
    teleBTC: "0x0670bEeDC28E9bF0748cB254ABd946c87f033D9d",
    startDate: "2024-01-01",
  },
  [CHAIN.BSQUARED]: {
    burnRouter: "0x84da07E1B81e3125A66124F37bEA4897e0bB4b90",
    exchangeRouter: "0xE0166434A2ad67536B5FdAFCc9a6C1B41CC5e085",
    transferRouter: "0x9042B082A31343dFf352412136fA52157ff7fdC8",
    teleBTC: "0x05698eaD40cD0941e6E5B04cDbd56CB470Db762A",
    startDate: "2024-01-01",
  },
};

const EVENT_SIGNATURES = {
  NEW_UNWRAP:
    "event NewUnwrap(bytes userScript,uint8 scriptType,address lockerTargetAddress,address indexed userTargetAddress,uint256 requestIdOfLocker,uint256 indexed deadline,uint256 thirdPartyId,address inputToken,uint256[3] amounts,uint256[4] fees)",
  NEW_WRAP_AND_SWAP_V1:
    "event NewWrapAndSwap(address lockerTargetAddress,address indexed user,address[2] inputAndOutputToken,uint256[2] inputAndOutputAmount,uint256 indexed speed,address indexed teleporter,bytes32 bitcoinTxId,uint256 appId,uint256 thirdPartyId,uint256[5] fees,uint256 destinationChainId)",
  NEW_WRAP_AND_SWAP_V2:
    "event NewWrapAndSwapV2(address lockerTargetAddress,bytes32 indexed user,bytes32[3] inputIntermediaryOutputToken,uint256[3] inputIntermediaryOutputAmount,uint256 indexed speed,address indexed teleporter,bytes32 bitcoinTxId,uint256 appId,uint256 thirdPartyId,uint256[5] fees,uint256 destinationChainId)",
  NEW_WRAP:
    "event NewWrap(bytes32 bitcoinTxId,bytes indexed lockerLockingScript,address lockerTargetAddress,address indexed user,address teleporter,uint256[2] amounts,uint256[4] fees,uint256 thirdPartyId,uint256 destinationChainId)",
} as const;

const FEE_INDICES = {
  LOCKER_FEE: 1,
  PROTOCOL_FEE: 2,
} as const;

async function processUnwrapEvents(
  options: FetchOptions,
  config: ChainConfig,
  dailyVolume: ReturnType<FetchOptions["createBalances"]>,
  dailyFees: ReturnType<FetchOptions["createBalances"]>
): Promise<void> {
  const unwrapLogs = await options.getLogs({
    target: config.burnRouter,
    eventAbi: EVENT_SIGNATURES.NEW_UNWRAP,
  });

  for (const unwrapLog of unwrapLogs) {
    const event = unwrapLog as UnwrapEvent;

    // Add volume from input token amount
    dailyVolume.add(event.inputToken, event.amounts[0]);

    // Add fees (BTC fees at indices 1 and 2)
    const btcFees =
      event.fees[FEE_INDICES.LOCKER_FEE] + event.fees[FEE_INDICES.PROTOCOL_FEE];
    dailyFees.add(config.teleBTC as string, btcFees);
  }
}

async function processWrapAndSwapEvents(
  options: FetchOptions,
  config: ChainConfig,
  dailyVolume: ReturnType<FetchOptions["createBalances"]>,
  dailyFees: ReturnType<FetchOptions["createBalances"]>
): Promise<void> {
  const [v1Logs, v2Logs] = await Promise.all([
    options.getLogs({
      target: config.exchangeRouter,
      eventAbi: EVENT_SIGNATURES.NEW_WRAP_AND_SWAP_V1,
    }),
    options.getLogs({
      target: config.exchangeRouter,
      eventAbi: EVENT_SIGNATURES.NEW_WRAP_AND_SWAP_V2,
    }),
  ]);

  for (const log of v1Logs) {
    const event = log as WrapAndSwapV1Event;
    dailyVolume.add(event.inputAndOutputToken[0], event.inputAndOutputAmount[0]);
    const fees =
      event.fees[FEE_INDICES.LOCKER_FEE] + event.fees[FEE_INDICES.PROTOCOL_FEE];
    dailyFees.add(config.teleBTC as string, fees);
  }

  for (const log of v2Logs) {
    const event = log as WrapAndSwapV2Event;
    dailyVolume.add(config.teleBTC, event.inputIntermediaryOutputAmount[0]);
    const fees =
      event.fees[FEE_INDICES.LOCKER_FEE] + event.fees[FEE_INDICES.PROTOCOL_FEE];
    dailyFees.add(config.teleBTC as string, fees);
  }
}

async function processWrapEvents(
  options: FetchOptions,
  config: ChainConfig,
  dailyVolume: ReturnType<FetchOptions["createBalances"]>,
  dailyFees: ReturnType<FetchOptions["createBalances"]>
): Promise<void> {
  const wrapLogs = await options.getLogs({
    target: config.transferRouter,
    eventAbi: EVENT_SIGNATURES.NEW_WRAP,
  });

  for (const wrapLog of wrapLogs) {
    const event = wrapLog as WrapEvent;

    // Add volume from input token (teleBTC) amount
    dailyVolume.add(config.teleBTC, event.amounts[0]);

    // Add fees (BTC fees at indices 1 and 2)
    const btcFees =
      event.fees[FEE_INDICES.LOCKER_FEE] + event.fees[FEE_INDICES.PROTOCOL_FEE];
    dailyFees.add(config.teleBTC as string, btcFees);
  }
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const config = CHAIN_CONFIGS[options.chain as keyof typeof CHAIN_CONFIGS];
  if (!config) {
    throw new Error(`Configuration not found for chain: ${options.chain}`);
  }

  await Promise.all([
    processUnwrapEvents(options, config, dailyVolume, dailyFees),
    processWrapAndSwapEvents(options, config, dailyVolume, dailyFees),
    processWrapEvents(options, config, dailyVolume, dailyFees),
  ]);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Volume: "Total value of Bitcoin bridged to and from EVM chains, based on amounts in NewUnwrap, NewWrap, and NewWrapAndSwap events emitted by the CCBurnRouter, CCExchangeRouter, and CCTransferRouter contracts",
  Fees: "Total of the protocol fee and Locker fee collected during bridging.",
  Revenue: "Total of the protocol fee and Locker fee collected during bridging.",
  ProtocolRevenue: "Total of the protocol fee and Locker fee collected during bridging.",
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {}
};

for (const [chain, config] of Object.entries(CHAIN_CONFIGS)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch,
    start: config.startDate,
  }
};

export default adapter;
