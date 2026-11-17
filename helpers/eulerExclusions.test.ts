import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import * as cache from './cache';
import { getEulerExcludedVaults } from './eulerExclusions';
import { CHAIN } from './chains';
import type { FetchOptions } from '../adapters/types';

// Run with:
// node --test -r ts-node/register/transpile-only helpers/eulerExclusions.test.ts

// Stub getConfig to return a controlled response, preventing live network requests to v3.euler.finance
// and preventing writes to the shared S3 cache during test execution.
let mockFlaggedVaults: string[] = [];
mock.method(cache, 'getConfig', async () => ({ vaults: mockFlaggedVaults }));

function createMockOptions(chain: string, dateString: string): FetchOptions {
  return {
    chain,
    dateString,
    api: {
      log: () => {},
    },
  } as unknown as FetchOptions;
}

const EXISTING_AVAX_VAULTS = {
  eUSDt3_K3: '0xa446938b0204Aa4055cdFEd68Ddf0E0d1BAB3E9E'.toLowerCase(),
  eAUSD2_Re7: '0x2137568666f12fc5A026f5430Ae7194F1C1362aB'.toLowerCase(),
  eUSDC15_Keyring: '0x8f23Da78e3F31Ab5DEb75dC3282198bed630ffde'.toLowerCase(),
  eUSDt2_Re7: '0xABA9d2D4b6B93C3dc8976D8eb0690CCA56431FE4'.toLowerCase(),
};

const NEW_K3_VAULTS = [
  {
    name: 'eBTC.b-5',
    vault: '0x6072A6d18446278bB5a43eb747de8F61e34cB77f'.toLowerCase(),
    dayBeforeDate: '2025-11-04',
    configuredDate: '2025-11-05',
    afterDate: '2025-11-06',
  },
  {
    name: 'eEURC-1',
    vault: '0xa4284e26Ae6469aeE8eC38Aa9Db96fc62d6315A1'.toLowerCase(),
    dayBeforeDate: '2025-11-03',
    configuredDate: '2025-11-04',
    afterDate: '2025-11-05',
  },
  {
    name: 'eUSDC-5',
    vault: '0x6fC9b3a52944A577cd8971Fd8fDE0819001bC595'.toLowerCase(),
    dayBeforeDate: '2025-11-16',
    configuredDate: '2025-11-17',
    afterDate: '2025-11-18',
  },
  {
    name: 'eWAVAX-5',
    vault: '0xe91841F707936faf515ff6d478624A325A4f9199'.toLowerCase(),
    dayBeforeDate: '2025-11-03',
    configuredDate: '2025-11-04',
    afterDate: '2025-11-05',
  },
  {
    name: 'eWETH.e-5',
    vault: '0x03ef14425CF0d7Af62Cdb8D6E0Acb0b0512aE35C'.toLowerCase(),
    dayBeforeDate: '2025-11-03',
    configuredDate: '2025-11-04',
    afterDate: '2025-11-05',
  },
];

test('all four existing Avalanche exclusions remain intact', async () => {
  const before = await getEulerExcludedVaults(createMockOptions(CHAIN.AVAX, '2025-11-03'));
  for (const [label, address] of Object.entries(EXISTING_AVAX_VAULTS)) {
    assert.ok(!before.has(address), `${label} should NOT be excluded before 2025-11-04`);
  }

  const onDate = await getEulerExcludedVaults(createMockOptions(CHAIN.AVAX, '2025-11-04'));
  for (const [label, address] of Object.entries(EXISTING_AVAX_VAULTS)) {
    assert.ok(onDate.has(address), `${label} should be excluded on 2025-11-04`);
  }

  const present = await getEulerExcludedVaults(createMockOptions(CHAIN.AVAX, '2026-11-17'));
  for (const [label, address] of Object.entries(EXISTING_AVAX_VAULTS)) {
    assert.ok(present.has(address), `${label} should be excluded on present date`);
  }
});

test('each new K3 Avalanche vault is included one day before, excluded on, and excluded after its configured date', async () => {
  for (const entry of NEW_K3_VAULTS) {
    // 1. Included one day before its configured date
    const beforeSet = await getEulerExcludedVaults(createMockOptions(CHAIN.AVAX, entry.dayBeforeDate));
    assert.ok(
      !beforeSet.has(entry.vault),
      `${entry.name} (${entry.vault}) must be included one day before (${entry.dayBeforeDate})`
    );

    // 2. Excluded on its configured date
    const onDateSet = await getEulerExcludedVaults(createMockOptions(CHAIN.AVAX, entry.configuredDate));
    assert.ok(
      onDateSet.has(entry.vault),
      `${entry.name} (${entry.vault}) must be excluded on configured date (${entry.configuredDate})`
    );

    // 3. Excluded after its configured date (day after and present)
    const dayAfterSet = await getEulerExcludedVaults(createMockOptions(CHAIN.AVAX, entry.afterDate));
    assert.ok(
      dayAfterSet.has(entry.vault),
      `${entry.name} (${entry.vault}) must be excluded day after (${entry.afterDate})`
    );

    const presentSet = await getEulerExcludedVaults(createMockOptions(CHAIN.AVAX, '2026-11-17'));
    assert.ok(
      presentSet.has(entry.vault),
      `${entry.name} (${entry.vault}) must be excluded on present date (2026-11-17)`
    );
  }
});

test('other chains are completely unaffected by Avalanche additions', async () => {
  const ethSet = await getEulerExcludedVaults(createMockOptions(CHAIN.ETHEREUM, '2026-11-17'));
  const bscSet = await getEulerExcludedVaults(createMockOptions(CHAIN.BSC, '2026-11-17'));
  const baseSet = await getEulerExcludedVaults(createMockOptions(CHAIN.BASE, '2026-11-17'));

  // Ensure none of the 5 new K3 Avalanche vaults appear in other chains' exclusion sets
  for (const entry of NEW_K3_VAULTS) {
    assert.ok(!ethSet.has(entry.vault), `${entry.name} should not be in Ethereum exclusions`);
    assert.ok(!bscSet.has(entry.vault), `${entry.name} should not be in BSC exclusions`);
    assert.ok(!baseSet.has(entry.vault), `${entry.name} should not be in Base exclusions`);
  }

  // Ensure established exclusions on other chains continue functioning
  assert.ok(ethSet.has('0x01864aE3c7d5f507cC4c24cA67B4CABbDdA37EcD'.toLowerCase()), 'ETH Stream vault excluded');
  assert.ok(bscSet.has('0xC41f2Ba7102e9F9F2d603eb951F955aE205ed272'.toLowerCase()), 'BSC Stream vault excluded');
  assert.ok(baseSet.has('0xC063C3b3625DF5F362F60f35B0bcd98e0fa650fb'.toLowerCase()), 'Base Resolv vault excluded');
});

test('dated exclusions take precedence over live bad-debt feed flags', async () => {
  const flaggedDatedVault = '0x6072A6d18446278bB5a43eb747de8F61e34cB77f'.toLowerCase(); // eBTC.b-5 (dated 2025-11-05)
  const flaggedUndatedVault = '0x1111111111111111111111111111111111111111'.toLowerCase(); // un-dated fixture

  mockFlaggedVaults = [flaggedDatedVault, flaggedUndatedVault];

  try {
    // Before configured date: dated vault is NOT excluded despite being flagged in feed; undated fixture IS excluded
    const beforeSet = await getEulerExcludedVaults(createMockOptions(CHAIN.AVAX, '2025-11-04'));
    assert.ok(
      !beforeSet.has(flaggedDatedVault),
      'Dated vault must NOT be excluded before its configured date, even if flagged in feed'
    );
    assert.ok(
      beforeSet.has(flaggedUndatedVault),
      'Undated vault flagged in feed must be excluded on every date'
    );

    // On configured date: both are excluded
    const onDateSet = await getEulerExcludedVaults(createMockOptions(CHAIN.AVAX, '2025-11-05'));
    assert.ok(onDateSet.has(flaggedDatedVault), 'Dated vault must be excluded on its configured date');
    assert.ok(onDateSet.has(flaggedUndatedVault), 'Undated vault flagged in feed remains excluded');
  } finally {
    mockFlaggedVaults = [];
  }
});
