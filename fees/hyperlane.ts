/**
 * Hyperlane core-fee adapter.
 *
 * Accounting model:
 * - dailyFees: total user-paid Hyperlane fees from InterchainGasPaymaster GasPayment events plus ProtocolFeePaid events
 * - dailySupplySideRevenue: relayer compensation from InterchainGasPaymaster GasPayment events
 * - dailyRevenue / dailyProtocolRevenue: protocol-retained fees from ProtocolFeePaid events
 *
 * Data sources:
 * - chains/addresses.yaml for deployed Hyperlane contract addresses
 * - chains/metadata.yaml for production/testnet/availability/indexing metadata
 *
 * Resilience policy:
 * - if one chain cannot resolve blocks or logs, that chain returns zero and the run continues
 * - chain list is limited to a curated Hyperlane EVM candidate set, and failing chains degrade to zero
 */
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getConfig } from "../helpers/cache";

type ChainConfig = {
  mailbox?: string;
  interchainGasPaymaster?: string;
  protocolFee?: string;
};

type ChainMetadata = {
  protocol?: string;
  isTestnet?: boolean;
  availabilityStatus?: string;
  indexFrom?: number;
};

// These Hyperlane registry endpoints follow the same source-of-truth approach used
// by Hyperlane's TVL adapter in DefiLlama-Adapters.

const REGISTRY_URL =
  "https://raw.githubusercontent.com/hyperlane-xyz/hyperlane-registry/main/chains/addresses.yaml";
const METADATA_URL =
  "https://raw.githubusercontent.com/hyperlane-xyz/hyperlane-registry/main/chains/metadata.yaml";

const CHAIN_MAP: Record<string, string> = {
  avalanche: "avax",
  gnosis: "xdai",
  hyperevm: "hyperliquid",
  plume: "plume_mainnet",
  swell: "swellchain",
  zoramainnet: "zora",
};

const HYPERLANE_CHAIN_CANDIDATES = [
  "arbitrum",
  "avax",
  "base",
  "blast",
  "bsc",
  "bsquared",
  "celo",
  "ethereum",
  "ink",
  "linea",
  "mantle",
  "metis",
  "mode",
  "optimism",
  "polygon",
  "scroll",
  "sonic",
  "swellchain",
  "unichain",
  "vana",
  "xdai",
  "zora",
];

const GAS_PAYMENT_EVENT =
  "event GasPayment(bytes32 indexed messageId, uint32 indexed destinationDomain, uint256 gasAmount, uint256 payment)";
const PROTOCOL_FEE_PAID_EVENT =
  "event ProtocolFeePaid(address indexed sender, uint256 fee)";

const INTERCHAIN_FEE_LABEL = "Interchain Gas Payments";
const PROTOCOL_FEE_LABEL = "Protocol Fees";
const REQUIRED_REGISTRY_KEYS = new Set(["interchainGasPaymaster", "protocolFee", "mailbox"]);

// Standard zeroed response used whenever a chain is unsupported, pre-index,
// or temporarily unhealthy so the adapter can continue for the rest.
function emptyResponse(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

// The Hyperlane registry files currently use a simple scalar YAML shape:
// exact 2-space indentation, simple key:value pairs, and no multi-line or
// complex YAML features for the fields this adapter reads.
function sanitizeYamlLine(rawLine: string) {
  const line = rawLine.replace(/\t/g, "    ");
  let out = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if ((char === '"' || char === "'") && line[i - 1] !== "\\") {
      quote = quote === char ? null : (char as '"' | "'");
      out += char;
      continue;
    }

    if (char === "#" && !quote) break;
    out += char;
  }

  return out.trimEnd();
}

// Registry values are expected to be simple quoted/unquoted scalars only.
function parseScalar(rawValue: string) {
  return rawValue.trim().replace(/^["']|["']$/g, "");
}

// addresses.yaml is expected to resolve into a flat per-chain object whose
// relevant scalar fields match REQUIRED_REGISTRY_KEYS / ChainConfig.
function parseRegistry(yaml: string): Record<string, ChainConfig> {
  const registry: Record<string, ChainConfig> = {};
  let currentChain = "";

  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = sanitizeYamlLine(rawLine);
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.search(/\S/);
    if (indent === 0 && line.endsWith(":")) {
      currentChain = line.slice(0, -1).trim();
      registry[currentChain] = {};
      continue;
    }

    if (indent !== 2 || !currentChain) continue;
    const match = line.match(/^\s{2}([\w-]+):\s*(.+?)\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (REQUIRED_REGISTRY_KEYS.has(key)) registry[currentChain][key as keyof ChainConfig] = parseScalar(rawValue);
  }

  return registry;
}

function parseMetadata(yaml: string): Record<string, ChainMetadata> {
  const metadata: Record<string, ChainMetadata> = {};
  let currentChain = "";
  let currentSection = "";

  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = sanitizeYamlLine(rawLine);
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.search(/\S/);
    if (indent === 0 && line.endsWith(":")) {
      currentChain = line.slice(0, -1).trim();
      currentSection = "";
      metadata[currentChain] = {};
      continue;
    }

    if (!currentChain) continue;

    if (indent === 2 && line.endsWith(":")) {
      currentSection = line.trim().slice(0, -1);
      continue;
    }

    const rootMatch = line.match(/^\s{2}([\w-]+):\s*(.+?)\s*$/);
    if (indent === 2 && rootMatch) {
      const [, key, rawValue] = rootMatch;
      const value = parseScalar(rawValue);
      if (key === "protocol") metadata[currentChain].protocol = value;
      else if (key === "isTestnet") metadata[currentChain].isTestnet = value === "true";
      continue;
    }

    const nestedMatch = line.match(/^\s{4}([\w-]+):\s*(.+?)\s*$/);
    if (indent === 4 && nestedMatch) {
      const [, key, rawValue] = nestedMatch;
      const value = parseScalar(rawValue);
      if (currentSection === "availability" && key === "status")
        metadata[currentChain].availabilityStatus = value;
      else if (currentSection === "index" && key === "from")
        metadata[currentChain].indexFrom = Number(value);
    }
  }

  return metadata;
}

let registryPromise: Promise<Record<string, ChainConfig>> | null = null;
let metadataPromise: Promise<Record<string, ChainMetadata>> | null = null;

async function getRegistry() {
  if (!registryPromise) {
    registryPromise = (async () => {
      const data = await getConfig("hyperlane/addresses", REGISTRY_URL);
      if (typeof data !== "string") throw new Error("Hyperlane registry fetch did not return YAML text");
      const parsed = parseRegistry(data);
      const parsedCandidateCount = HYPERLANE_CHAIN_CANDIDATES.filter((chain) =>
        Object.entries(parsed).some(([registryChain, config]) =>
          (CHAIN_MAP[registryChain] ?? registryChain) === chain && !!config.interchainGasPaymaster
        )
      ).length;
      if (!parsedCandidateCount) throw new Error("Failed to parse any Hyperlane candidate chains from addresses.yaml");
      return parsed;
    })();
  }

  return registryPromise;
}

async function getMetadata() {
  if (!metadataPromise) {
    metadataPromise = (async () => {
      const data = await getConfig("hyperlane/metadata", METADATA_URL);
      if (typeof data !== "string") throw new Error("Hyperlane metadata fetch did not return YAML text");
      const parsed = parseMetadata(data);
      if (!Object.keys(parsed).length) throw new Error("Failed to parse Hyperlane metadata.yaml");
      return parsed;
    })();
  }

  return metadataPromise;
}

async function getChainConfig(chain: string) {
  const [registry, metadata] = await Promise.all([getRegistry(), getMetadata()]);

  for (const [registryChain, config] of Object.entries(registry)) {
    const mappedChain = CHAIN_MAP[registryChain] ?? registryChain;
    if (mappedChain !== chain) continue;
    if (!config.interchainGasPaymaster?.startsWith("0x")) return undefined;
    return {
      config,
      metadata: metadata[registryChain] ?? metadata[mappedChain],
    };
  }
}

async function fetch(options: FetchOptions) {
  // Resolve per-chain contracts dynamically from Hyperlane's registry.
  const chainData = await getChainConfig(options.chain);
  if (!chainData?.config?.interchainGasPaymaster) return emptyResponse(options);

  const { config, metadata } = chainData;

  // Only run on production EVM chains that Hyperlane metadata marks as available.
  if (metadata?.isTestnet || metadata?.availabilityStatus === "disabled" || metadata?.protocol !== "ethereum")
    return emptyResponse(options);

  let fromBlock: number | null = null;
  let toBlock: number | null = null;
  try {
    fromBlock = await options.getStartBlock();
    toBlock = await options.getEndBlock();
  } catch (error) {
    console.error("[hyperlane] block lookup failed", { chain: options.chain, error });
    return emptyResponse(options);
  }

  if (fromBlock == null || toBlock == null) {
    return emptyResponse(options);
  }

  if (metadata?.indexFrom && toBlock < metadata.indexFrom) return emptyResponse(options);
  const effectiveFromBlock = metadata?.indexFrom ? Math.max(fromBlock, metadata.indexFrom) : fromBlock;
  if (effectiveFromBlock > toBlock) return emptyResponse(options);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  try {
    // Relayer compensation paid by users for message delivery.
    const gasPayments = await options.getLogs({
      fromBlock: effectiveFromBlock,
      toBlock,
      target: config.interchainGasPaymaster,
      eventAbi: GAS_PAYMENT_EVENT,
    });

    gasPayments.forEach((log: any) => {
      dailyFees.addGasToken(log.payment, INTERCHAIN_FEE_LABEL);
      dailySupplySideRevenue.addGasToken(log.payment, INTERCHAIN_FEE_LABEL);
    });

    if (config.protocolFee?.startsWith("0x")) {
      try {
        // Protocol-retained fee hook revenue. On many chains this is currently zero
        // because the fee hook is configured but protocolFee() is disabled.
        const protocolFeePayments = await options.getLogs({
          fromBlock: effectiveFromBlock,
          toBlock,
          target: config.protocolFee,
          eventAbi: PROTOCOL_FEE_PAID_EVENT,
        });

        protocolFeePayments.forEach((log: any) => {
          dailyFees.addGasToken(log.fee, PROTOCOL_FEE_LABEL);
          dailyRevenue.addGasToken(log.fee, PROTOCOL_FEE_LABEL);
        });
      } catch (error) {
        console.error("[hyperlane] ProtocolFeePaid log fetch failed", {
          chain: options.chain,
          target: config.protocolFee,
          event: PROTOCOL_FEE_PAID_EVENT,
          error,
        });
      }
    }

    return {
      dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: dailyRevenue,
    };
  } catch (error) {
    // Chain-level runtime issues degrade to zero so the rest of the adapter can continue,
    // but registry/metadata parsing failures still surface above because they affect all chains.
    console.error("[hyperlane] GasPayment log fetch failed", {
      chain: options.chain,
      target: config.interchainGasPaymaster,
      event: GAS_PAYMENT_EVENT,
      error,
    });
    return emptyResponse(options);
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: HYPERLANE_CHAIN_CANDIDATES,
  start: "2025-01-01",
  pullHourly: true,
  fetch,
  methodology: {
    Fees: "Tracks total user-paid Hyperlane fees by summing InterchainGasPaymaster GasPayment events and ProtocolFeePaid events on each origin chain, with contract addresses loaded dynamically from Hyperlane's registry.",
    Revenue:
      "Tracks retained Hyperlane protocol fee revenue by summing ProtocolFeePaid events emitted by Hyperlane's ProtocolFee hook contracts when configured in the Hyperlane registry.",
    SupplySideRevenue:
      "Tracks relayer compensation by summing InterchainGasPaymaster GasPayment events, which represent delivery fees paid through Hyperlane's relayer path.",
    ProtocolRevenue:
      "Same as Revenue: sums ProtocolFeePaid events emitted by Hyperlane's ProtocolFee hook contracts when configured in the Hyperlane registry.",
  },
  breakdownMethodology: {
    dailyFees: {
      [INTERCHAIN_FEE_LABEL]:
        "Sum of relayer compensation values emitted in Hyperlane InterchainGasPaymaster GasPayment events.",
      [PROTOCOL_FEE_LABEL]:
        "Sum of protocol-retained fee values emitted in Hyperlane ProtocolFeePaid events.",
    },
    dailyRevenue: {
      [PROTOCOL_FEE_LABEL]:
        "Sum of fee values emitted in Hyperlane ProtocolFeePaid events.",
    },
    dailySupplySideRevenue: {
      [INTERCHAIN_FEE_LABEL]:
        "Sum of payment values emitted in Hyperlane InterchainGasPaymaster GasPayment events.",
    },
    dailyProtocolRevenue: {
      [PROTOCOL_FEE_LABEL]:
        "Sum of fee values emitted in Hyperlane ProtocolFeePaid events.",
    },
  },
};

export default adapter;
