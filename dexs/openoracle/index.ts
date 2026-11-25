import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addOneToken } from "../../helpers/prices";

// https://basescan.org/address/0x0cf849531f77E4bfE2d869db5b3F9Bca83d68626#code
const OPEN_ORACLE = "0x0cf849531f77E4bfE2d869db5b3F9Bca83d68626";
const ReportSubmitted = "event ReportSubmitted(uint256 indexed reportId, bytes packed)";
const ReportDisputed = "event ReportDisputed(uint256 indexed reportId, bytes packed)";

type Round = { reporter: string; token1: string; amount1: bigint; token2: string; amount2: bigint };

// Event data is the game state packed by OpenOracleSlim._packMem, not ABI-encoded.
function toRound(data: string): Round {
  const field = (from: number, to: number) => "0x" + data.slice(2 + from * 2, 2 + to * 2);
  const token = (from: number, to: number) => (field(from, to) === ADDRESSES.null ? ADDRESSES.base.WETH : field(from, to));
  return {
    amount1: BigInt(field(0, 16)),
    amount2: BigInt(field(16, 32)),
    reporter: field(32, 52),
    token1: token(64, 84),
    token2: token(144, 164),
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const getLogs = (eventAbi: string) => options.getLogs({ target: OPEN_ORACLE, eventAbi, entireLog: true, parseLog: false });
  const [reports, disputes] = await Promise.all([getLogs(ReportSubmitted), getLogs(ReportDisputed)]);
  const isDispute = new Set(disputes);
  const logs = [...reports, ...disputes].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  const latestRound: Record<string, Round> = {};
  for (const log of logs) {
    const round = toRound(log.data);
    const reportId = log.topics[1];
    const taken = latestRound[reportId];
    latestRound[reportId] = round;
    // A dispute swaps against the game's previous round; games settle within seconds, so it is in this window.
    if (!isDispute.has(log) || !taken || taken.reporter === round.reporter) continue;
    addOneToken({ balances: dailyVolume, token0: taken.token1, amount0: taken.amount1, token1: taken.token2, amount1: taken.amount2 });
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-09-01",
  methodology: {
    Volume:
      "Value of swaps made when a trader disputes an openOracle price report on Base and takes the reporter's tokens, counted once on the USDC or ETH side. Excludes reporters disputing their own reports.",
  },
};

export default adapter;
