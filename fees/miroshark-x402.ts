import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// x402.miroshark.xyz — MiroShark's paid x402 API (https://www.miroshark.xyz/):
// multi-agent social simulation runs priced at $1.00 USDC per POST /run call.
//
// Payments settle on Base as gasless USDC transfers (EIP-3009
// transferWithAuthorization) submitted by x402 facilitators. Facilitator
// sender addresses rotate, so instead of a facilitator allowlist we identify
// x402 settlements structurally: a USDC Transfer to the payTo wallet whose
// transaction also emits AuthorizationUsed(authorizer = payer) — the signature
// of a gasless EIP-3009 settlement. Plain transfers (CEX withdrawals, manual
// sends, swap outputs) emit no AuthorizationUsed and are excluded.
const USDC = ADDRESSES.base.USDC;
const RECEIVERS = [
  '0x6cab485fc28ec70d3845113b704d4824e4d2b24f', // payTo wallet (MiroShark deployer)
  '0x67976cebb5266b50a08c0dcb676e03baf305e3a2', // early payments landed here due to a payTo misconfiguration
];

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const AUTHORIZATION_USED_TOPIC = '0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5'; // AuthorizationUsed(address,bytes32)

const padAddress = (address: string) => '0x000000000000000000000000' + address.slice(2).toLowerCase();
const topicToAddress = (topic: string) => '0x' + topic.slice(26).toLowerCase();

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const ownWallets = new Set(RECEIVERS.map((a) => a.toLowerCase()));

  for (const receiver of RECEIVERS) {
    const transfers = await options.getLogs({
      target: USDC,
      topics: [TRANSFER_TOPIC, null as any, padAddress(receiver)],
      entireLog: true,
    });

    // external payers seen today
    const payers = [...new Set(
      transfers.map((log: any) => topicToAddress(log.topics[1])).filter((payer: string) => !ownWallets.has(payer))
    )];

    // transactions where a payer used an EIP-3009 authorization (x402 settlement)
    const authorizedTxs = new Set<string>();
    for (const payer of payers) {
      const auths = await options.getLogs({
        target: USDC,
        topics: [AUTHORIZATION_USED_TOPIC, padAddress(payer)],
        entireLog: true,
      });
      auths.forEach((log: any) => authorizedTxs.add(log.transactionHash.toLowerCase()));
    }

    for (const log of transfers) {
      const payer = topicToAddress(log.topics[1]);
      if (ownWallets.has(payer)) continue; // internal transfer
      if (!authorizedTxs.has(log.transactionHash.toLowerCase())) continue; // not a gasless EIP-3009 settlement
      dailyFees.add(USDC, BigInt(log.data).toString(), "API usage fees");
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: '2026-04-01',
  methodology: {
    Fees: 'API usage fees paid by users of the x402.miroshark.xyz simulation API ($1.00 USDC per simulation run), settled on Base via x402 (gasless EIP-3009 USDC transfers submitted by x402 facilitators).',
    Revenue: 'All API fees accrue to MiroShark — there is no supply side and facilitators charge no on-chain cut.',
    ProtocolRevenue: 'All API fees accrue to MiroShark.',
  },
  breakdownMethodology: {
    Fees: {
      'API usage fees': 'Fees paid by users of the x402.miroshark.xyz simulation API ($1.00 USDC per simulation run), settled on Base via x402.',
    },
    Revenue: {
      'API usage fees': 'All API usage fees accrue to MiroShark.',
    },
    ProtocolRevenue: {
      'API usage fees': 'All API usage fees accrue to MiroShark.',
    },
  },
};

export default adapter;
