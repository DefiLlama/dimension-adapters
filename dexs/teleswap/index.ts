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

type Balances = ReturnType<FetchOptions["createBalances"]>;

interface Accumulators {
  dailyVolume: Balances;
  dailyFees: Balances;
  dailySupplySideRevenue: Balances;
  dailyProtocolRevenue: Balances;
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

// Every event's fee array: index 1 = Locker fee and index 3 = referral fee (both
// supply-side), index 2 = protocol fee (treasury). index 0 (network/bitcoin) and
// index 4 (bridge) are passthrough. Verified on the deployed routers.
const FEE_INDICES = {
  LOCKER_FEE: 1,
  PROTOCOL_FEE: 2,
  THIRD_PARTY_FEE: 3,
} as const;

function recordFees(
  acc: Accumulators,
  teleBTC: string,
  fees: readonly number[]
): void {
  const lockerFee = fees[FEE_INDICES.LOCKER_FEE];
  const protocolFee = fees[FEE_INDICES.PROTOCOL_FEE];
  const thirdPartyFee = fees[FEE_INDICES.THIRD_PARTY_FEE];
  acc.dailyFees.add(teleBTC, lockerFee, "Locker Fees");
  acc.dailyFees.add(teleBTC, protocolFee, "Protocol Fees");
  acc.dailyFees.add(teleBTC, thirdPartyFee, "Third Party Fees");

  acc.dailyProtocolRevenue.add(teleBTC, protocolFee, "Protocol Fees");
  
  acc.dailySupplySideRevenue.add(teleBTC, lockerFee, "Locker Fees");
  acc.dailySupplySideRevenue.add(teleBTC, thirdPartyFee, "Third Party Fees");
}

async function processUnwrapEvents(
  options: FetchOptions,
  config: ChainConfig,
  acc: Accumulators
): Promise<void> {
  const unwrapLogs = await options.getLogs({
    target: config.burnRouter,
    eventAbi: EVENT_SIGNATURES.NEW_UNWRAP,
  });

  for (const unwrapLog of unwrapLogs) {
    const event = unwrapLog as UnwrapEvent;

    // Only swapAndUnwrap (input token != teleBTC) runs an AMM swap; a plain
    // unwrap is a 1:1 teleBTC burn (bridge outflow) and is not swap volume.
    if (event.inputToken.toLowerCase() !== config.teleBTC.toLowerCase()) {
      acc.dailyVolume.add(event.inputToken, event.amounts[0]);
    }

    recordFees(acc, config.teleBTC, event.fees);
  }
}

async function processWrapAndSwapEvents(
  options: FetchOptions,
  config: ChainConfig,
  acc: Accumulators
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
    acc.dailyVolume.add(event.inputAndOutputToken[0], event.inputAndOutputAmount[0]);
    recordFees(acc, config.teleBTC, event.fees);
  }

  for (const log of v2Logs) {
    const event = log as WrapAndSwapV2Event;
    acc.dailyVolume.add(config.teleBTC, event.inputIntermediaryOutputAmount[0]);
    recordFees(acc, config.teleBTC, event.fees);
  }
}

async function processWrapEvents(
  options: FetchOptions,
  config: ChainConfig,
  acc: Accumulators
): Promise<void> {
  const wrapLogs = await options.getLogs({
    target: config.transferRouter,
    eventAbi: EVENT_SIGNATURES.NEW_WRAP,
  });

  for (const wrapLog of wrapLogs) {
    const event = wrapLog as WrapEvent;

    // A plain wrap is a 1:1 BTC->teleBTC mint (bridge inflow) with no swap leg,
    // so it is not counted as swap volume — only its fees are recorded.
    recordFees(acc, config.teleBTC, event.fees);
  }
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const acc: Accumulators = {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
  };

  const config = CHAIN_CONFIGS[options.chain as keyof typeof CHAIN_CONFIGS];
  if (!config) {
    throw new Error(`Configuration not found for chain: ${options.chain}`);
  }

  await Promise.all([
    processUnwrapEvents(options, config, acc),
    processWrapAndSwapEvents(options, config, acc),
    processWrapEvents(options, config, acc),
  ]);

  return {
    dailyVolume: acc.dailyVolume,
    dailyFees: acc.dailyFees,
    dailyRevenue: acc.dailyProtocolRevenue,
    dailySupplySideRevenue: acc.dailySupplySideRevenue,
    dailyProtocolRevenue: acc.dailyProtocolRevenue,
  };
}

const methodology = {
  Volume: "The value of tokens swapped on TeleSwap: BTC bridged in and swapped to another token, or a token swapped and bridged out to BTC. Plain bridge transfers that only wrap or unwrap BTC one-for-one, with no swap, are not counted as volume.",
  Fees: "The Locker fee, protocol fee, and referral fee charged on every bridge transaction.",
  Revenue: "The protocol fee only. The Locker fee and referral fee are paid out to others, so they are not revenue for the protocol.",
  SupplySideRevenue: "The Locker fee plus any referral fee — paid to Lockers (who lock up collateral to back teleBTC and process each bridge transaction) and to third parties that refer users.",
  ProtocolRevenue: "The protocol fee, which goes to the TeleSwap treasury.",
}

const breakdownMethodology = {
  Fees: {
    "Locker Fees": "Fees Paid to the Locker that custodies the BTC and mints teleBTC",
    "Protocol Fees": "Fees Paid to the TeleSwap protocol",
    "Third Party Fees": "Fee for an integrating third party (referrer/frontend), sent to that party's address",
  },
  Revenue: {
    "Protocol Fees": "Fees Paid to the TeleSwap protocol",
  },
  ProtocolRevenue: {
    "Protocol Fees": "Fees Paid to the TeleSwap protocol",
  },
  SupplySideRevenue: {
    "Locker Fees": "Fees Paid to the Locker that custodies the BTC and mints teleBTC",
    "Third Party Fees": "Fee for an integrating third party (referrer/frontend), sent to that party's address",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {}
};

for (const [chain, config] of Object.entries(CHAIN_CONFIGS)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch,
    start: config.startDate,
  }
};

export default adapter;
