import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";

const LOTTERY_HUB = "0x4958CB13Fa5881B2c67bde408708e72411Bb3bbb";
const USER_LOTTERY_MANAGER = "0x9D247A82c1e645af0b6DBA10785A26fa0b6552eA";
const PROTOCOL_LOTTERY_MANAGER = "0x98f29223fB9c399fa0efA65d837BdB581032Cc44";

const LOTTERY_KIND_SUPER = 3; // enum LotteryKind { NONE, USER, REGULAR, SUPER, BATTLE }

const ABI = {
  TicketsBought: "event TicketsBought(uint256 indexed lotteryId, address indexed buyer, uint256 qty, address referrer)",
  ReferrerFeeAdded: "event ReferrerFeeAdded(uint256 indexed lotteryId, address indexed referrer, address indexed token, uint256 amount, address buyer)",
  CreatorFeeAdded: "event CreatorFeeAdded(uint256 indexed lotteryId, address indexed creator, address token, uint256 amount)",
  getManagerBatch: "function getManagerBatch(uint256[] lotteryIds) view returns (address[] managers)",
  getLottery: "function getLottery(uint256 lotteryId) view returns ((address creator, uint8 kind, uint8 model, (uint256 ticketPrice, address asset, uint256 feeBp, uint24 maxTickets, uint64 startTime, uint64 endTime) params, uint256 payoutRateBp, uint256 cltAmountPerTicket, uint256 feederSuperLotteryId, uint256 feederAllocBp))",
  treasury: "address:treasury",
  cltToken: "address:cltToken",
};

const LABELS = {
  TICKET_PROTOCOL_FEES: "Ticket Protocol Fees",
  TICKET_PROTOCOL_FEES_TO_REFERRERS: "Ticket Protocol Fees To Referrers",
  TICKET_PROTOCOL_FEES_TO_TREASURY: "Ticket Protocol Fees To Treasury",
  CREATOR_FEES: METRIC.CREATOR_FEES,
  CREATOR_FEES_TO_LOTTERY_CREATORS: "Creator Fees To Lottery Creators",
};

/**
 * Ticket sales volume, fees and revenue for one window on one chain, built from CoinLotto contract events.
 * CLT-denominated flows are excluded.
 */
const fetch = async (options: FetchOptions) => {
  const { api, getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const referrerFeeLogs = await getLogs({ targets: [USER_LOTTERY_MANAGER, PROTOCOL_LOTTERY_MANAGER], eventAbi: ABI.ReferrerFeeAdded });
  const creatorFeeLogs = await getLogs({ target: USER_LOTTERY_MANAGER, eventAbi: ABI.CreatorFeeAdded });
  const buyLogs = await getLogs({ target: LOTTERY_HUB, eventAbi: ABI.TicketsBought, onlyArgs: false });

  /** Dimension balances for the window; user fees and protocol revenue mirror fees and revenue. */
  const result = () => ({
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  });

  // contracts were deployed mid-day on the start date: skip state reads when the window has no activity
  if (!referrerFeeLogs.length && !creatorFeeLogs.length && !buyLogs.length) return result();

  const clt = (await api.call({ target: PROTOCOL_LOTTERY_MANAGER, abi: ABI.cltToken })).toLowerCase();
  /** True when the token is CLT, whose flows are out of scope. */
  const isClt = (token: string) => token.toLowerCase() === clt;

  referrerFeeLogs.forEach((log: any) => {
    if (isClt(log.token)) return;
    dailyFees.add(log.token, log.amount, LABELS.TICKET_PROTOCOL_FEES);
    dailySupplySideRevenue.add(log.token, log.amount, LABELS.TICKET_PROTOCOL_FEES_TO_REFERRERS);
  });

  creatorFeeLogs.forEach((log: any) => {
    if (isClt(log.token)) return;
    dailyFees.add(log.token, log.amount, LABELS.CREATOR_FEES);
    dailySupplySideRevenue.add(log.token, log.amount, LABELS.CREATOR_FEES_TO_LOTTERY_CREATORS);
  });

  if (buyLogs.length) {
    const lotteryIds = [...new Set(buyLogs.map((log: any) => log.args.lotteryId.toString()))];
    const managers = await api.call({ target: LOTTERY_HUB, abi: ABI.getManagerBatch, params: [lotteryIds] as any }); // CallParams has no nested-array type for uint256[] args
    const lotteries = await api.multiCall({ abi: ABI.getLottery, calls: lotteryIds.map((id, i) => ({ target: managers[i], params: [id] })) });
    const lotteryById: Record<string, any> = {};
    lotteryIds.forEach((id, i) => lotteryById[id] = lotteries[i]);
    /** True for lotteries whose tickets are paid in an ERC-20 other than CLT (Super Lotteries are paid in CLT). */
    const isErc20Sale = (lottery: any) => Number(lottery.kind) !== LOTTERY_KIND_SUPER && !isClt(lottery.params.asset);

    const buyersByTx: Record<string, Set<string>> = {};
    buyLogs.forEach((log: any) => {
      const lottery = lotteryById[log.args.lotteryId.toString()];
      if (!isErc20Sale(lottery)) return;
      dailyVolume.add(lottery.params.asset, BigInt(log.args.qty) * BigInt(lottery.params.ticketPrice));
      const txHash = log.transactionHash.toLowerCase();
      if (!buyersByTx[txHash]) buyersByTx[txHash] = new Set();
      buyersByTx[txHash].add(log.args.buyer.toLowerCase());
    });

    const tokens = [...new Set(lotteries.filter(isErc20Sale).map((lottery: any) => lottery.params.asset.toLowerCase()))];
    const treasuries = [...new Set((await api.multiCall({ abi: ABI.treasury, calls: [USER_LOTTERY_MANAGER, PROTOCOL_LOTTERY_MANAGER] })).map((t: string) => t.toLowerCase()))];
    if (tokens.length) {
      const toTreasury = await addTokensReceived({
        options,
        targets: treasuries,
        tokens,
        logFilter: (log: any) => !!buyersByTx[log.transactionHash.toLowerCase()]?.has(log.from.toLowerCase()),
      });
      dailyFees.addBalances(toTreasury, LABELS.TICKET_PROTOCOL_FEES);
      dailyRevenue.addBalances(toTreasury, LABELS.TICKET_PROTOCOL_FEES_TO_TREASURY);
    }
  }

  return result();
};

const methodology = {
  Volume: "Total value of lottery tickets sold in ERC-20 tokens (ticket price times quantity). Super Lottery tickets bought with the CLT token are excluded.",
  Fees: "Protocol fees and lottery creator fees charged on ticket purchases, including the protocol fee share passed to referrers. Prize pools, Super Lottery allocations, prize pool top-ups, prize payouts and CLT-denominated fees are excluded; CLT-denominated fees are temporarily out of scope of this integration.",
  UserFees: "Protocol fees and lottery creator fees paid by ticket buyers, excluding CLT-denominated fees.",
  Revenue: "Protocol fees on ticket purchases kept by CoinLotto after the referrer share, including the Super Lottery fee taken on feeder allocations, excluding CLT-denominated fees.",
  ProtocolRevenue: "Protocol fees on ticket purchases sent to the CoinLotto treasury after the referrer share, including the Super Lottery fee taken on feeder allocations, excluding CLT-denominated fees.",
  SupplySideRevenue: "Share of the protocol fee paid to referrers plus creator fees paid to creators of user lotteries, excluding CLT-denominated rewards.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.TICKET_PROTOCOL_FEES]: "Protocol fee charged on ticket purchases: the part transferred to the treasury (including the Super Lottery fee on feeder allocations) plus the referrer share (ReferrerFeeAdded events).",
    [LABELS.CREATOR_FEES]: "Creator fee of user lotteries, 0-30% of ticket sales set per lottery (CreatorFeeAdded events).",
  },
  UserFees: {
    [LABELS.TICKET_PROTOCOL_FEES]: "Protocol fee paid by ticket buyers, including the referrer share and the Super Lottery fee on feeder allocations.",
    [LABELS.CREATOR_FEES]: "Creator fee of user lotteries paid by ticket buyers.",
  },
  Revenue: {
    [LABELS.TICKET_PROTOCOL_FEES_TO_TREASURY]: "Protocol fee transferred from ticket buyers to the CoinLotto treasury during ticket purchases.",
  },
  ProtocolRevenue: {
    [LABELS.TICKET_PROTOCOL_FEES_TO_TREASURY]: "Protocol fee transferred from ticket buyers to the CoinLotto treasury during ticket purchases.",
  },
  SupplySideRevenue: {
    [LABELS.TICKET_PROTOCOL_FEES_TO_REFERRERS]: "Share of the protocol fee accrued to the buyer's referrer, currently 50% (ReferrerFeeAdded events).",
    [LABELS.CREATOR_FEES_TO_LOTTERY_CREATORS]: "Creator fee accrued to user lottery creators (CreatorFeeAdded events).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  // Polygon will be added once it is deployed to prod
  chains: [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.BASE],
  start: "2026-10-27", // prod deployment: ETH block 26282709, BSC block 130053895, Base block 53149371
  methodology,
  breakdownMethodology,
};

export default adapter;
