import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://docs.renegade.fi/addresses-and-endpoints/v1 and /v2
const config: Record<string, { darkpools: string[]; usdc: string; weth9?: string }> = {
  [CHAIN.ARBITRUM]: {
    darkpools: ["0x30bd8eab29181f790d7e495786d4b96d7afdc518", "0xc5d1b8096bbdec83bc6049e42822c7483bba6500"],
    usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    // aeWETH mints/burns with Transfer events, so native ETH legs are already covered by the Transfer logs
  },
  [CHAIN.BASE]: {
    darkpools: ["0xb4a96068577141749CC8859f586fE29016C935dB", "0x15d7cf277be6463f153dd0d4d73f92ad65e6348c"],
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    weth9: "0x4200000000000000000000000000000000000006", // WETH9 wraps with Deposit/Withdrawal only
  },
};

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const DEPOSIT_EVENT = "event Deposit(address indexed dst, uint256 wad)";
const WITHDRAWAL_EVENT = "event Withdrawal(address indexed src, uint256 wad)";

type Flow = { token: string; amount: bigint };

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { darkpools, usdc, weth9 } = config[options.chain];

  for (const darkpool of darkpools) {
    const padded = ethers.zeroPadValue(darkpool, 32);
    const [inLogs, outLogs, wethIn, wethOut] = await Promise.all([
      options.getLogs({ noTarget: true, eventAbi: TRANSFER_EVENT, topics: [TRANSFER_TOPIC, null as any, padded], entireLog: true }),
      options.getLogs({ noTarget: true, eventAbi: TRANSFER_EVENT, topics: [TRANSFER_TOPIC, padded], entireLog: true }),
      weth9 ? options.getLogs({ target: weth9, eventAbi: DEPOSIT_EVENT, topics: [ethers.id("Deposit(address,uint256)"), padded], entireLog: true }) : [],
      weth9 ? options.getLogs({ target: weth9, eventAbi: WITHDRAWAL_EVENT, topics: [ethers.id("Withdrawal(address,uint256)"), padded], entireLog: true }) : [],
    ]);

    // a settlement moves tokens both into and out of the darkpool in the same tx;
    // plain deposits (in only), withdrawals and fee redemptions (out only) are skipped
    const txsWithOutflow = new Set<string>([...outLogs, ...wethOut].map((l: any) => l.transactionHash.toLowerCase()));
    const inflows: Record<string, Flow[]> = {};
    for (const l of [...inLogs, ...wethIn] as any[]) {
      if (l.data === "0x") continue;
      const tx = l.transactionHash.toLowerCase();
      if (!txsWithOutflow.has(tx)) continue;
      if (!inflows[tx]) inflows[tx] = [];
      inflows[tx].push({ token: l.address.toLowerCase(), amount: BigInt(l.data) });
    }

    for (const flows of Object.values(inflows)) {
      // the input token of each publicly-settled side enters the darkpool. When both sides
      // settle publicly (public intents) both legs flow in, so count only the USDC quote leg
      // to avoid double counting; otherwise only the external party's input leg is present
      const tokens = new Set(flows.map((f) => f.token));
      let counted = flows;
      if (tokens.size > 1) {
        const pick = tokens.has(usdc) ? usdc : [...tokens].sort()[0];
        counted = flows.filter((f) => f.token === pick);
      }
      counted.forEach((f) => dailyVolume.add(f.token, f.amount));
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: "2024-09-03",
    },
    [CHAIN.BASE]: {
      start: "2025-05-29",
    },
  },
  methodology: {
    Volume: "On-chain settled volume of the Renegade v1 and v2 darkpools: the input-token transfers into the darkpool in settlement transactions (txs that move tokens both into and out of the darkpool). When both sides settle publicly only the USDC leg is counted. Fully private (internal) matches move no tokens on-chain and are not visible.",
  },
};

export default adapter;
