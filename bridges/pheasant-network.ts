import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { ChainApi } from "@defillama/sdk";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";

// Pheasant Network bridge: a user deposit emits NewTrade on the source chain's bridge contract (outgoing), and the
// destination payout emits Filled on that chain's ERC-7683 payout executor (incoming, after fees; the source Withdraw
// only reimburses the relayer). Addresses from the bridges-server adapter; payout executors from params.payoutExecutor(networkCode).
// Not counted: the old adapter's CCTP wrapper (DepositForBurnCalled, value moves through Circle CCTP) and PheasantSwap
// (SwapNewTrade, tokens handed to third-party aggregators); both registered one log as a deposit and a withdrawal.
const NEW_TRADE = "event NewTrade(address indexed userAddress, uint256 index, address to, uint256 amount, address token)";
const FILLED = "event Filled(bytes32 indexed orderId, bytes32 indexed orderTermsHash, address indexed recipient, address token, uint256 amount, address filler)";

// Earlier bridge deployments. Only the deposit side is recorded on-chain for them. The first two kinds emit NewTrade
// without the amount, which is read from getTrade; they only bridged ETH.
// Addresses: the address list of the @pheasant-network/pheasant-sdk npm package. Periods: first and last trade of the
// contracts of each kind.
const LEGACY_NEW_TRADE = "event NewTrade(address indexed userAddress, uint256 index)";
const TRADE_FIELDS = "uint256 index, address user, uint8 tokenTypeIndex, uint256 amount, uint256 timestamp, address to, address relayer, uint8 status, uint256 fee";
const GET_TRADE = {
  a: `function getTrade(address, uint256) view returns ((${TRADE_FIELDS}, uint256 disputeTimestamp, bool isUpward))`,
  b: `function getTrade(address, uint256) view returns ((${TRADE_FIELDS}, uint256 destCode))`,
};
// Active period of each kind, [from, to) in UTC.
const PERIOD = {
  a: ["2022-12-21", "2023-09-19"],
  b: ["2023-09-14", "2024-10-17"],
  c: ["2024-10-09", "2024-12-11"],
  d: ["2024-12-10", "2026-06-10"],
};
type Kind = keyof typeof PERIOD;
const CURRENT_START = "2026-06-08";
const RETIRED = "2024-12-11";
// Earlier Morph deployments report ETH as WETH, which has no price for 2024; it is counted as ETH.
const MORPH_WETH = "0x5300000000000000000000000000000000000011";
const CANCELLED = 99; // trade status of a deposit returned to the user
const isZero = (address?: string) => !address || address.toLowerCase() === ADDRESSES.null;
const toTimestamp = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

type ChainConfig = {
  start: string;
  deadFrom?: string;
  bridge?: string;
  payoutExecutor?: string;
  legacy?: Partial<Record<Kind, string>>;
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    start: CURRENT_START,
    bridge: "0x20A41749545eB0C6266838257aDeA7b86d5369Ac",
    payoutExecutor: "0xb56De9d9Fb52f7Ef86407DC669868D24b61714A0",
  },
  [CHAIN.OPTIMISM]: {
    start: "2023-01-08",
    bridge: "0x0C4F10259c8b5Ed7238B76A0a6EfEf82cd2908Bf",
    payoutExecutor: "0x3ADf0Ae154c6FAd0aEf6bCdf8a7198Ebea37AD60",
    legacy: {
      a: "0x5726fafF070a508Db271b54B8458b9b6Bc9440c7",
      b: "0x558F7547A472a6897126e20440453e57AC320794",
      c: "0xCC5E2c65F596530aaF6B93be740F3fF301320AbB",
      d: "0x6Aca7B9a3700B19CB5909208704A4e71B30e7840",
    },
  },
  [CHAIN.ARBITRUM]: {
    start: "2023-02-08",
    bridge: "0x97450C9B5fC6D1b86bF87EFDCbB137f26F8b497e",
    payoutExecutor: "0xD0d9df958bB728B0C90E7c94Aa398C26D2e4a3C5",
    legacy: {
      a: "0x04bc515cF3cbd26EA7c621a6220B5648F764030c",
      b: "0xb9ACb5601C091B39960a6c4974b979483132B30A",
      c: "0x6adAd7EaAFd9Cb68c2c8e442813B46366F110eC6",
      d: "0x3B5357D73fC65487449Cd68550adB9F46A0b8068",
    },
  },
  [CHAIN.SCROLL]: {
    start: "2023-10-10",
    bridge: "0xcAebc3309bFe45313922BFBa1a36C4458937E2A2",
    payoutExecutor: "0xd24E559A023729e95863d0Afc4B99Ff01969d8E3",
    legacy: {
      b: "0x27cb8546F60fD5d7869a223F40b8036a9eBe3a4f",
      c: "0xF8A452f54C2111285aB73b821831705598D6409F",
      d: "0x4e44f012B66C839A9904d128B93F80Dd5e3a1b21",
    },
  },
  [CHAIN.BASE]: {
    start: "2023-09-21",
    bridge: "0x8A7Ee008B18DF025bc778B034Dbd7ad507221e10",
    payoutExecutor: "0x25cf6B24eC351d1695490B2046310cA3e8AdBE7B",
    legacy: {
      b: "0x0890f8A7b193A3eEE810DE3AdcFAd181b9ce294E",
      c: "0x6A9A29B9d8Bf7c97c810cd9d216D12E84c40F869",
      d: "0xDce25728E076ee5BCD146fD9F5FB5360ad18bCa0",
    },
  },
  [CHAIN.LINEA]: {
    start: "2023-07-15",
    bridge: "0xbe7F97E4B54747B75B8aaF84ecafE876BaCA9198",
    payoutExecutor: "0x4393Cd250B2EC2cF7d3391c79de902207b246539",
    legacy: {
      a: "0xef23B98C5b2bf0544D777A26314A6c4F3b23d749",
      b: "0x9E7FCb2c0b8a5461BCc7078a2E37886f254B060b",
      c: "0xEC937340b76515ef247a9eA733abda84CEc68645",
      d: "0x505cf4BB10bD1320f2F07d445bBe06A721B6CF53",
    },
  },
  [CHAIN.TAIKO]: {
    start: "2024-05-28",
    bridge: "0x7a651Ef5A53B128d406c9093feA2650e8A6156b5",
    payoutExecutor: "0xaae93A258792cFa4734e3fE897910fB0A90fE01d",
    legacy: {
      b: "0x0890f8A7b193A3eEE810DE3AdcFAd181b9ce294E",
      c: "0xB064440846a251153537c02E3ee438a78cBdbeD0",
      d: "0x04e28F7244980d3280F3b485D9cDA4b58F6C99B5",
    },
  },
  [CHAIN.MORPH]: {
    start: "2024-10-23",
    bridge: "0x56DE23ed536b2Bf8D398F2E1703Ce9aDb48B09F4",
    payoutExecutor: "0x52bC80E50FE8C8C4Fa131E7169eF9B64dA905685",
    legacy: { c: "0xA89C8a2d22e8C43428F376502A77946fB7826852", d: "0xbD45fC4826Fd0981F1A3d8330cf75309fBC9ce33" },
  },
  [CHAIN.ERA]: {
    start: "2023-09-22",
    bridge: "0xaFDaD3F10c7c906434422F229bCfB120bcE51C6c",
    payoutExecutor: "0x7120a850cD4FAd691147164D2eD8F2DEDb77Cc60",
    legacy: {
      b: "0x77201FC74123Ea148C836418a08Da3322B3201D3",
      c: "0x9eC2766ede295418C8c38475C07d76E1fCD6BE31",
      d: "0x85308f2393A8F49E64e3b71Bb24f57614844497c",
    },
  },
  [CHAIN.UNICHAIN]: {
    start: "2025-08-08",
    bridge: "0x81505846153403EBd6Cf5e89dD9f3eF2277fe374",
    payoutExecutor: "0x5c2E7369f044Ae87e40B19582056ede717953337",
    legacy: { d: "0xbD192e039F3D1A9BC84A12679fdE2F40ae7b4FfF" },
  },
  [CHAIN.MEGAETH]: {
    start: "2025-12-29",
    bridge: "0x554590DC69830507248Ebc7AD3Bc9d6fA94488d2",
    payoutExecutor: "0x89E31B12e5fD6961474F7d814F90a5a0fDD7d55A",
    legacy: { d: "0x9E7FCb2c0b8a5461BCc7078a2E37886f254B060b" },
  },
  // no longer supported
  [CHAIN.POLYGON]: {
    start: "2022-12-21",
    deadFrom: RETIRED,
    legacy: {
      a: "0xBc50F86Fb21D2427c1f0FC11450C95892208ECD6",
      b: "0x84F90083e4aA00B5FD4DAaaEEc75bdF8978EDCD2",
      c: "0xbA7E55A7e3Fc6D40331328Bb91A36e972c2af740",
    },
  },
  [CHAIN.MODE]: {
    start: "2023-11-21",
    deadFrom: RETIRED,
    legacy: { b: "0x04bc515cF3cbd26EA7c621a6220B5648F764030c", c: "0x84F90083e4aA00B5FD4DAaaEEc75bdF8978EDCD2" },
  },
  [CHAIN.XLAYER]: {
    start: "2024-04-16",
    deadFrom: RETIRED,
    legacy: { b: "0x04bc515cF3cbd26EA7c621a6220B5648F764030c", c: "0x0e428F7CA2E43084b8A2e4fBea0BFd1464E59a03" },
  },
};

const fetch = async (options: FetchOptions) => {
  const { bridge, payoutExecutor, legacy = {} } = chainConfig[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  const targets: string[] = [];
  for (const [kind, target] of Object.entries(legacy) as [Kind, string][]) {
    const [from, to] = PERIOD[kind].map(toTimestamp);
    if (options.toTimestamp <= from || options.fromTimestamp >= to) continue;
    if (kind === "c" || kind === "d") {
      targets.push(target);
      continue;
    }
    const logs = await options.getLogs({ target, eventAbi: LEGACY_NEW_TRADE });
    // trades never change their amount, so they are read at the latest block
    const trades = await new ChainApi({ chain: options.chain }).multiCall({
      abi: GET_TRADE[kind],
      calls: logs.map((l: any) => ({ target, params: [l.userAddress, l.index] })),
    });
    for (const trade of trades) {
      if (trade.isUpward) continue; // created on the destination chain
      if (Number(trade.status) === CANCELLED || isZero(trade.user) || isZero(trade.to)) continue;
      dailyOutgoingVolume.addCGToken("ethereum", Number(trade.amount) / 1e18);
      dailyOutgoingTxCount++;
    }
  }
  if (bridge && options.toTimestamp > toTimestamp(CURRENT_START)) targets.push(bridge);

  if (targets.length) {
    const trades = await options.getLogs({ targets, eventAbi: NEW_TRADE });
    for (const l of trades) {
      if (isZero(l.userAddress) || isZero(l.to)) continue;
      dailyOutgoingVolume.add(l.token.toLowerCase() === MORPH_WETH ? ADDRESSES.null : l.token, l.amount);
      dailyOutgoingTxCount++;
    }
  }
  if (payoutExecutor && options.toTimestamp > toTimestamp(CURRENT_START)) {
    const fills = await options.getLogs({ target: payoutExecutor, eventAbi: FILLED });
    for (const l of fills) dailyIncomingVolume.add(l.token, l.amount);
    dailyIncomingTxCount = fills.length;
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    OutgoingVolume: "Value of tokens users deposit into Pheasant Network's bridge on each chain.",
    IncomingVolume: "Value of tokens paid out to users on each chain when their Pheasant Network transfer is filled, after fees.",
    OutgoingTxCount: "Number of Pheasant Network deposits on each chain.",
    IncomingTxCount: "Number of Pheasant Network payouts on each chain.",
  },
};

export default adapter;
