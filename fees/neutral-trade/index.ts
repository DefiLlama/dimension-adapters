import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getSolanaReceived } from "../../helpers/token";
import { getConfig } from "../../helpers/cache";
import { getEnv } from "../../helpers/env";
import { httpPost } from "../../utils/fetchURL";
import { encodeBase58 } from "ethers";

const VAULTS_REGISTRY_URL =
  "https://cdn.jsdelivr.net/gh/neutral-trade/sdk@main/src/registry/vaults.json";

// Treasury pubkey offset in Bundle account:
// disc(8) + name(32) + manager(32) + keeper(32) = 104
const TREASURY_OFFSET = 104;

function extractPubkey(base64Data: string, offset: number): string {
  const buf = Buffer.from(base64Data, "base64");
  return encodeBase58(new Uint8Array(buf.slice(offset, offset + 32)));
}

const fetch = async (options: FetchOptions) => {
  const vaults: any[] = await getConfig("neutral-trade/vaults", VAULTS_REGISTRY_URL);
  const bundleVaults = vaults.filter((v: any) => v.type === "Bundle" && v.vaultAddress);
  const addresses = bundleVaults.map((v: any) => v.vaultAddress);

  // Read Bundle accounts to extract treasury addresses
  const resp = await httpPost(getEnv("SOLANA_RPC"), {
    jsonrpc: "2.0", id: 1, method: "getMultipleAccounts",
    params: [addresses, { encoding: "base64" }],
  });

  const treasuryAddresses: string[] = [];
  for (const account of resp.result.value) {
    if (!account?.data?.[0]) continue;
    treasuryAddresses.push(extractPubkey(account.data[0], TREASURY_OFFSET));
  }

  // Track all USDC received by vault treasuries (management + performance + deposit/withdrawal fees)
  const dailyFees = await getSolanaReceived({
    options,
    targets: treasuryAddresses,
    mints: ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees:
    "All fees distributed to Neutral Trade vault treasury accounts: management fees (annual AUM fee), performance fees (commission on profits above HWM), and deposit/withdrawal fees.",
  Revenue: "All fees are retained by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]:
      "Management, performance, and deposit/withdrawal fees distributed to vault treasury accounts on-chain.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "All fees retained by protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2024-11-01",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
