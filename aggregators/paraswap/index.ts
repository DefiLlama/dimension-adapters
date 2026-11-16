import { zeroPadValue } from "ethers";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { sleep } from "../../utils/utils";

interface IResponse {
  daily: any[];
  allTime: any;
}

// returns only the trailing 366 days (date params are ignored), keyed by chain id
const feesMMURL = "https://api.paraswap.io/stk/volume-stats/breakdown-by-chain";

const chainConfig: Record<string, { id: string; start: string; deadFrom?: string }> = {
  [CHAIN.ETHEREUM]: { id: '1', start: '2022-03-22' },
  [CHAIN.OPTIMISM]: { id: '10', start: '2022-03-22' },
  [CHAIN.BSC]: { id: '56', start: '2022-03-22' },
  // live earlier, but the API's history only reaches back to 2025-11-05 (trailing 366 days on 2026-11-05)
  [CHAIN.XDAI]: { id: '100', start: '2025-11-05' },
  [CHAIN.UNICHAIN]: { id: '130', start: '2025-11-05' },
  [CHAIN.POLYGON]: { id: '137', start: '2022-03-22' },
  [CHAIN.FANTOM]: { id: '250', start: '2022-03-22', deadFrom: '2025-04-12' }, // delisted, last volume 2025-04-11
  [CHAIN.POLYGON_ZKEVM]: { id: '1101', start: '2022-03-22', deadFrom: '2025-07-10' }, // delisted, last volume 2025-07-09
  [CHAIN.ROBINHOOD]: { id: '4663', start: '2026-09-04' }, // first day in the API
  [CHAIN.BASE]: { id: '8453', start: '2022-03-22' },
  [CHAIN.ARBITRUM]: { id: '42161', start: '2022-03-22' },
  [CHAIN.AVAX]: { id: '43114', start: '2022-03-22' },
}

// The API stopped updating Polygon during 2026-11-13 (that row ends around 20:00 UTC, later rows have no chain 137),
// so from that day Polygon volume is read from Augustus v6.2, which matched the API within 0.2% on 2026-11-10..12
const POLYGON_ONCHAIN_FROM = 1794528000; // 2026-11-13
const AUGUSTUS_V6_2 = '0x6a000f20005980200259b80c5102003040001068';
const POL_NATIVE = '0x0000000000000000000000000000000000001010'; // emits LogTransfer for every native POL transfer
const WPOL = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'; // an unwrap to Augustus follows the WPOL transfer that was already counted
const EURE_LEGACY = '0x18ec0a6e18e5bc3784fdd3a3634b31245ab704f6'; // Monerium EURe v1, mirrors each transfer of EURe 0xe0aea583266584dafbb3f9c3211d5588c73fea8d
const TRANSFER_EVENT = 'event Transfer(address indexed from, address indexed to, uint256 value)';
const LOG_TRANSFER_EVENT = 'event LogTransfer(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 input1, uint256 input2, uint256 output1, uint256 output2)';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const LOG_TRANSFER_TOPIC = '0xe6497e3ee548a3372136af2fcb0696db31fc6cf20260707645068bd3fe97f3c4';

const prefetch = async (_: any) => {
  const headers: any = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    "priority": "u=0, i",
    "upgrade-insecure-requests": "1",
    "referrerPolicy": "strict-origin-when-cross-origin",
  };

  // sometime paraswap api return unknown 500 error
  // need to retry if it failed
  for (let i = 0; i < 5; i++) {
    try {
      return await httpGet(feesMMURL, { headers });
    } catch(e: any) {
      if (i === 4) {
        throw e;
      }
    }

    await sleep(5000); // sleep 5 secs for next try
  }

}

// Augustus v6.2 emits no swap event. Executors send the swap output to Augustus, which pays the beneficiary and the fees,
// so volume is what Augustus receives. Fees are left out: vault deposits and direct partner fees can't be split from logs alone.
const fetchPolygonVolume = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const augustus = zeroPadValue(AUGUSTUS_V6_2, 32);
  // noTarget is filtered on the indexed recipient, Augustus is not the emitter of the token transfers it receives
  // allowParseFailure skips NFT transfers to Augustus (same topic0, 4 topics) instead of failing the day
  const erc20Logs = await options.getLogs({ noTarget: true, eventAbi: TRANSFER_EVENT, topics: [TRANSFER_TOPIC, null as any, augustus], entireLog: true, maxBlockRange: 10000, allowParseFailure: true });
  const nativeLogs = await options.getLogs({ target: POL_NATIVE, eventAbi: LOG_TRANSFER_EVENT, topics: [LOG_TRANSFER_TOPIC, null as any, null as any, augustus], entireLog: true, parseLog: true });

  const inflows = [
    ...erc20Logs.filter((log: any) => log.args).map((log: any) => ({ tx: log.transactionHash.toLowerCase(), index: Number(log.logIndex ?? log.index), token: log.address.toLowerCase(), from: log.args.from.toLowerCase(), amount: log.args.value })),
    ...nativeLogs.map((log: any) => ({ tx: log.transactionHash.toLowerCase(), index: Number(log.logIndex ?? log.index), token: POL_NATIVE, from: log.args.from.toLowerCase(), amount: log.args.amount })),
  ];
  const inflowsByTx: Record<string, typeof inflows> = {};
  for (const inflow of inflows) (inflowsByTx[inflow.tx] ??= []).push(inflow);

  for (const inflow of inflows) {
    if (inflow.token === EURE_LEGACY) continue;
    if (inflow.token !== POL_NATIVE) {
      dailyVolume.add(inflow.token, inflow.amount);
      continue;
    }
    if (inflow.from === WPOL) continue;
    // native POL sent with the call (msg.value) is the swap input, the output token reaches Augustus after it
    if (inflowsByTx[inflow.tx].some((other) => other.token !== POL_NATIVE && other.index > inflow.index)) continue;
    dailyVolume.addGasToken(inflow.amount);
  }

  return { dailyVolume };
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  if (options.chain === CHAIN.POLYGON && options.startOfDay >= POLYGON_ONCHAIN_FROM) return fetchPolygonVolume(options);

  const { id } = chainConfig[options.chain];
  const response: IResponse = options.preFetchedResults;
  const day = response?.daily?.find(([time]: any) => time === options.startOfDay);
  // a day older than the API's 366-day window must not be stored as 0
  if (!day) throw new Error(`Velora API has no data for ${options.dateString}`);
  if (!day[1][id]) throw new Error(`Velora API has no ${options.chain} data for ${options.dateString}`);
  const [dailyVolume, partnerRev, protocolRev]: number[] = day[1][id];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  dailyFees.addUSDValue((partnerRev || 0) + (protocolRev || 0), 'Token Swap Fees');
  dailySupplySideRevenue.addUSDValue(partnerRev || 0, 'Fees To Partners');
  
  const revenue = protocolRev || 0;
  const revenueToVelora = revenue * 0.85;
  const revenueToDAO = revenue * 0.15 * 0.8;
  const revenueToStakers = revenue * 0.15 * 0.2;
  
  dailyRevenue.addUSDValue(revenueToVelora, 'Fees To Velora Foundation');
  dailyRevenue.addUSDValue(revenueToDAO, 'Fees To Velora DAO');
  dailyRevenue.addUSDValue(revenueToStakers, 'Fees To Velora Token Stakers');
  
  dailyProtocolRevenue.addUSDValue(revenueToVelora, 'Fees To Velora Foundation');
  dailyProtocolRevenue.addUSDValue(revenueToDAO, 'Fees To Velora DAO');
  
  dailyHoldersRevenue.addUSDValue(revenueToStakers, 'Fees To Velora Token Stakers');

  return {
    dailyVolume: dailyVolume || 0,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: chainConfig,
  fetch,
  prefetch,
  methodology: {
    Volume: "Swap volume from the Velora stats API. Polygon from 2026-11-13 is read on-chain: tokens delivered to Augustus v6.2 as swap output.",
    Fees: "All trading fees paid by users. Excludes Polygon from 2026-11-13.",
    UserFees: "All trading fees paid by users. Excludes Polygon from 2026-11-13.",
    Revenue: "Share of 80% trading fees to Velora, DAO, and token stakers. Excludes Polygon from 2026-11-13.",
    ProtocolRevenue: "Trading fees shared to Velora and DAO. Excludes Polygon from 2026-11-13.",
    HoldersRevenue: "Trading fees to stakers as part of PSP 2.0 staking rewards. Excludes Polygon from 2026-11-13.",
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Users pay flat fee 0.15% while trading using Velora.',
    },
    Revenue: {
      'Fees To Velora Foundation': 'Share of 85% swap fees to Velora Foudation.',
      'Fees To Velora DAO': 'Share of 80% from 15% total swap fees to Velora DAO.',
      'Fees To Velora Token Stakers': 'Share of 20% from 15% total swap fees to Velora Token Stakers.',
    },
    ProtocolRevenue: {
      'Fees To Velora Foundation': 'Share of 85% swap fees to Velora Foudation.',
      'Fees To Velora DAO': 'Share of 80% from 15% total swap fees to Velora DAO.',
    },
    HoldersRevenue: {
      'Fees To Velora Token Stakers': 'Share of 20% from 15% total swap fees to Velora Token Stakers.',
    },
    SupplySideRevenue: {
      'Fees To Partners': 'Fees paid to partnerships and integrators with Velora.',
    },
  }
}

export default adapter;
