import type { SimpleAdapter } from "../../adapters/types";
import type { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// ── Contract Addresses & Constants ──
const PREV_X3X_CONTRACT: string = "0x68f571e43C8d96e40c2DAdb69f4a13749D563095".toLowerCase();
const CURR_X3X_CONTRACT: string = "0xfD724468e9913d0EBb37AB4D06E42Ca0CDd38eeE".toLowerCase();
const ALL_X3X_CONTRACTS: string[] = [PREV_X3X_CONTRACT, CURR_X3X_CONTRACT];

// WLD token address used by X3XGame (all bets and payouts are in WLD)
const WLD_TOKEN: string = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003".toLowerCase();

// ── ABI Fragments ──
const abi = {
  GameCreated:
    "event GameCreated(string preliminaryGameId, uint256 indexed onChainGameId, address indexed player, uint256 betAmount, bytes32 gameSeedHash)",
  PayoutSent:
    "event PayoutSent(uint256 indexed onChainGameId, uint256 amount, address indexed recipient)",
};

const fetch: FetchV2 = async ({
  getLogs,
  createBalances,
  getFromBlock,
  getToBlock,
}: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances();

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  // Aggregate total volume (bets + payouts) across both old and new contract addresses
  let aggregateVolume: bigint = 0n;

  for (const contractAddr of ALL_X3X_CONTRACTS) {
    // 1) Sum all bet amounts from GameCreated events
    const gameCreatedLogs = await getLogs({
      target: contractAddr,
      eventAbi: abi.GameCreated,
      fromBlock,
      toBlock,
    });

    let betSum: bigint = 0n;
    for (const log of gameCreatedLogs) {
      betSum += BigInt(log.betAmount);
    }

    // 2) Sum all payout amounts from PayoutSent events
    // const payoutSentLogs = await getLogs({
    //   target: contractAddr,
    //   eventAbi: abi.PayoutSent,
    //   fromBlock,
    //   toBlock,
    // });

    // let payoutSum: bigint = 0n;
    // for (const log of payoutSentLogs) {
    //   payoutSum += BigInt(log.amount);
    // }

    aggregateVolume += betSum; // + payoutSum;
  }

  if (aggregateVolume > 0n) {
    dailyVolume.add(WLD_TOKEN, aggregateVolume);
  }

  return {
    dailyVolume
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.WC]: {
      fetch,
      start: "2025-06-01",
      meta: {
        methodology: {
          Volume: "Sum of bets (GameCreated) in WLD across X3X contracts",
          Fees: "No fees are implemented yet.",
          Revenue: "No fees are implemented yet for revenue.",
        },
      },
    },
  },
};

export default adapter;