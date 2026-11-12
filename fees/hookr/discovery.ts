import { FeeAccounting, lowercase } from './common';
import { BLOCK, CONTRACT, NATIVE, OLD_ROOTS } from './config';

export type Pool = {
  id: string;
  root: string;
  rules: string;
  subject: string;
  quote: string;
  baseFee: bigint;
  block: number;
  executor?: string;
};

const poolConfig =
  'function poolConfig(bytes32) view returns((address subject,address quote,address rules,address advisory,' +
  'address liquidityOwner,uint24 baseLpFeePips,(uint24 maxLpFeePips,uint24 maxQuoteTakePips,' +
  'uint16 maxSubjectTakeBps) caps,uint32 rulesGasLimit,uint32 advisoryGasLimit,uint8 advisoryPhases,' +
  'bool advisoryFailOpen,bytes32 policyId))';

const stack =
  'function stack(bytes32) view returns((bool configured,bool initialized,address kernel,bytes32 kernelId,' +
  'bytes32 kernelFamilyId,bytes32 kernelCodeHash,address subject,address quote,bytes32 stackHash,' +
  'bytes32 trustedRouterIntegrationId,bytes32 trustedRouterCodeHash,bytes32 trustedQuoterIntegrationId,' +
  'bytes32 trustedQuoterCodeHash,bytes32 correctionExecutorIntegrationId,bytes32 correctionExecutorCodeHash,' +
  'uint8 moduleCount,(uint24 baseLpFeePips,uint24 maxLpFeePips,uint16 maxSpecifiedQuoteTakeBps,' +
  'uint16 maxUnspecifiedQuoteTakeBps,uint16 maxSubjectTakeBps,uint32 maxTotalModuleGas,address trustedRouter,' +
  'address trustedQuoter,address correctionExecutor,address correctionCreator,uint16 correctionMaxVolumeBps,' +
  'uint96 correctionMinProfitQuote,bytes32 correctionFeePolicyId) limits))';

/** Discover only pools owned by published roots or whose Rules name Hookr's treasury. */
export async function discoverPools(accounting: FeeAccounting) {
  const current = await discoverCurrentPools(accounting);
  const modular = await discoverModularPools(accounting);
  const queues = await discoverTaxQueues(accounting, current);
  return {
    current,
    modular,
    queues,
    roots: [...new Set([...current.values()].map(pool => pool.root))],
    rules: [...new Set([...current.values()].map(pool => pool.rules))],
  };
}

/** Cache immutable registration events; read pool terms at the requested window's closing block. */
async function discoverCurrentPools(accounting: FeeAccounting) {
  const { options } = accounting;
  const roots = new Set<string>([CONTRACT.root]);

  for (const eventAbi of [
    'event RootRegistered(address indexed root)',
    'event FactoryRootRegistered(address indexed factory,address indexed root)',
    'event OwnedRootRegistered(address indexed root,address indexed factory,address indexed template,' +
      'address rules)',
  ]) {
    for (const log of await accounting.getLogs([CONTRACT.registry], eventAbi, {
      fromBlock: BLOCK.registry,
      cacheInCloud: true,
    })) {
      roots.add(lowercase(log.args.root));
    }
  }

  const opened = await accounting.getLogs(
    [...roots],
    'event PoolOpened(bytes32 indexed id,address indexed launcher,bytes32 indexed policyHash,address rules,' +
      'address advisory)',
    { fromBlock: BLOCK.root, cacheInCloud: true },
  );
  const rules = [...new Set<string>(opened.map(log => lowercase(log.args.rules)))];
  const recipients = rules.length
    ? await options.toApi.multiCall({ abi: 'address:protocolRecipient', calls: rules })
    : [];
  const admittedRules = new Set(
    rules.filter((_, index) => lowercase(recipients[index]) === CONTRACT.treasury),
  );
  const included = opened.filter(log => admittedRules.has(lowercase(log.args.rules)));
  const configs = included.length
    ? await options.toApi.multiCall({
        abi: poolConfig,
        calls: included.map(log => ({ target: log.address, params: [log.args.id] })),
      })
    : [];
  const current = new Map<string, Pool>();
  included.forEach((log, index) => {
    const poolConfig = configs[index];
    if (lowercase(poolConfig.rules) !== lowercase(log.args.rules)) {
      throw new Error('Hookr: pool Rules differs from immutable discovery');
    }

    current.set(lowercase(log.args.id), {
      id: lowercase(log.args.id),
      root: log.address,
      rules: lowercase(poolConfig.rules),
      subject: lowercase(poolConfig.subject),
      quote: lowercase(poolConfig.quote),
      baseFee: BigInt(poolConfig.baseLpFeePips),
      block: log.blockNumber,
    });
  });

  for (const log of await accounting.getLogs(
    [...roots],
    'event PoolLane(bytes32 indexed id,address indexed executor,bytes32 codeHash,uint16 partnerBps,' +
      'bytes32 family)',
    { fromBlock: BLOCK.root, cacheInCloud: true },
  )) {
    const pool = current.get(lowercase(log.args.id));
    if (pool && pool.root === log.address) {
      pool.executor = lowercase(log.args.executor);
    }
  }

  return current;
}

/** Authenticate the older modular stack's root host, then read its frozen fee and executor terms. */
async function discoverModularPools(accounting: FeeAccounting) {
  const { options } = accounting;
  // First StackConfigured in the full historical scan; the registry has no earlier pools.
  const configured = await accounting.getLogs(
    [CONTRACT.v2Registry],
    'event StackConfigured(bytes32 indexed poolId,bytes32 indexed stackHash,bytes32 indexed kernelId,' +
      'address subject,address quote,uint8 moduleCount)',
    { fromBlock: BLOCK.modular, cacheInCloud: true },
  );
  const stacks = configured.length
    ? await options.toApi.multiCall({
        target: CONTRACT.v2Registry,
        abi: stack,
        calls: configured.map(log => log.args.poolId),
      })
    : [];
  const modular = new Map<string, Pool>();
  configured.forEach((log, index) => {
    const stackConfig = stacks[index];
    // StackCore.kernel names the root HOST, which delegates to the accounting implementation.
    // Authenticate against the published protocol roots, not a quote token or the module address.
    if (!OLD_ROOTS.includes(lowercase(stackConfig.kernel))) {
      return;
    }

    modular.set(lowercase(log.args.poolId), {
      id: lowercase(log.args.poolId),
      root: lowercase(stackConfig.kernel),
      rules: '',
      subject: lowercase(stackConfig.subject),
      quote: lowercase(stackConfig.quote),
      baseFee: BigInt(stackConfig.limits.baseLpFeePips),
      block: log.blockNumber,
      executor: lowercase(stackConfig.limits.correctionExecutor),
    });
  });
  return modular;
}

/** Bind each tax queue to an authenticated pool's quote; a quote token alone cannot prove ownership. */
async function discoverTaxQueues(accounting: FeeAccounting, current: Map<string, Pool>) {
  const queues = new Map<string, string>();
  // Both published directional-tax revisions; each binding authenticates its root, pool and treasury.
  // https://github.com/Hookr-fun/hookr-contracts/tree/main/hookr-1/hook-blocks/directional-tax
  const advisories = [
    '0x99012422e1acbdf53c42bb378eb2f4e468005d3c',
    '0xe73fad0d773b9571a7a9d2a1edc01132ff5f1e1f',
  ];

  for (const log of await accounting.getLogs(
    advisories,
    'event DirectionalTaxBound(address indexed root,bytes32 indexed id,uint24 buyTaxPips,address buyQueue,' +
      'uint24 sellTaxPips,address sellQueue,uint16 protocolShareBps,address protocolRecipient)',
    { fromBlock: BLOCK.root, cacheInCloud: true },
  )) {
    const binding = log.args;
    const pool = current.get(lowercase(binding.id));
    if (
      lowercase(binding.protocolRecipient) !== CONTRACT.treasury ||
      !pool ||
      pool.root !== lowercase(binding.root)
    ) {
      continue;
    }

    for (const queue of [binding.buyQueue, binding.sellQueue]) {
      if (lowercase(queue) !== NATIVE) {
        queues.set(lowercase(queue), pool.quote);
      }
    }
  }

  return queues;
}

export type Discovery = Awaited<ReturnType<typeof discoverPools>>;
