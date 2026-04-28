import axios from "axios"
import { getEnv } from "./env";
import * as fs from 'fs';
import * as path from 'path';
import { elastic, log } from "@defillama/sdk";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";

// ==================== Credit Tracking ====================

export interface DuneQueryRecord {
  queryId: string;
  adapter: string;
  chain?: string;
  creditsUsed: number;
  durationSeconds: number;
  rowsReturned: number;
  timestamp: number;
  isBatched: boolean;
  batchSize?: number;
  executionId?: string;
}

export interface AdapterCreditSummary {
  adapter: string;
  totalCredits: number;
  queryCount: number;
  avgCreditsPerQuery: number;
  avgDurationSeconds: number;
  totalRows: number;
}

export interface DuneBillingPeriod {
  start_date: string;
  end_date: string;
  credits_used: number;
  credits_included: number;
}

export interface DuneUsageResponse {
  billingPeriods: DuneBillingPeriod[];
}

export interface CreditReport {
  generatedAt: number;
  runStartedAt: number;
  totalCreditsUsed: number;
  totalQueryCount: number;
  avgCreditsPerQuery: number;
  topConsumers: AdapterCreditSummary[];
  recentQueries: DuneQueryRecord[];
  expensiveQueries: DuneQueryRecord[];
}

// In-memory credit tracker
const _queryRecords: DuneQueryRecord[] = [];
let _runStartedAt = Math.floor(Date.now() / 1000);
let _totalCreditsThisRun = 0;

// Adapter name context — set externally before running an adapter
let _currentAdapterName = 'unknown';
let _currentChain: string | undefined = undefined;

const EXPENSIVE_CREDIT_THRESHOLD = Number(process.env.DUNE_EXPENSIVE_CREDIT_THRESHOLD ?? 100);
const EXPENSIVE_DURATION_THRESHOLD = Number(process.env.DUNE_EXPENSIVE_DURATION_THRESHOLD ?? 30);
const MAX_CREDITS_PER_RUN = Number(process.env.DUNE_MAX_CREDITS_PER_RUN ?? Infinity);

/** Set the current adapter context for credit attribution */
export function setDuneAdapterContext(adapterName: string, chain?: string): void {
  _currentAdapterName = adapterName;
  _currentChain = chain;
}

function _recordQuery(record: DuneQueryRecord): void {
  _queryRecords.push(record);
  _totalCreditsThisRun += record.creditsUsed;

  if (record.creditsUsed > EXPENSIVE_CREDIT_THRESHOLD || record.durationSeconds > EXPENSIVE_DURATION_THRESHOLD) {
    console.warn(
      `[Dune][EXPENSIVE] adapter=${record.adapter} queryId=${record.queryId} ` +
      `credits=${record.creditsUsed} duration=${record.durationSeconds.toFixed(1)}s ` +
      `rows=${record.rowsReturned} chain=${record.chain ?? 'N/A'}`
    );
  }
}

function _checkBudget(): void {
  if (_totalCreditsThisRun >= MAX_CREDITS_PER_RUN) {
    throw new Error(
      `[Dune] Credit budget exceeded: ${_totalCreditsThisRun.toFixed(2)}/${MAX_CREDITS_PER_RUN} credits used`
    );
  }
}

/** Get total credits consumed in this run */
export function getDuneCreditsUsedThisRun(): number {
  return _totalCreditsThisRun;
}

/** Get raw query records */
export function getDuneQueryRecords(): ReadonlyArray<DuneQueryRecord> {
  return _queryRecords;
}

/** Reset tracker between runs */
export function resetDuneCreditTracker(): void {
  _queryRecords.length = 0;
  _totalCreditsThisRun = 0;
  _runStartedAt = Math.floor(Date.now() / 1000);
}

/** Generate a full credit report from in-memory data */
export function generateDuneCreditReport(): CreditReport {
  const adapterMap = new Map<string, DuneQueryRecord[]>();
  for (const record of _queryRecords) {
    if (!adapterMap.has(record.adapter)) adapterMap.set(record.adapter, []);
    adapterMap.get(record.adapter)!.push(record);
  }

  const topConsumers: AdapterCreditSummary[] = [];
  for (const [adapter, queries] of adapterMap.entries()) {
    const totalCredits = queries.reduce((s, q) => s + q.creditsUsed, 0);
    const totalDuration = queries.reduce((s, q) => s + q.durationSeconds, 0);
    const totalRows = queries.reduce((s, q) => s + q.rowsReturned, 0);
    topConsumers.push({
      adapter,
      totalCredits,
      queryCount: queries.length,
      avgCreditsPerQuery: queries.length > 0 ? totalCredits / queries.length : 0,
      avgDurationSeconds: queries.length > 0 ? totalDuration / queries.length : 0,
      totalRows,
    });
  }
  topConsumers.sort((a, b) => b.totalCredits - a.totalCredits);

  const expensiveQueries = _queryRecords
    .filter(q => q.creditsUsed > EXPENSIVE_CREDIT_THRESHOLD || q.durationSeconds > EXPENSIVE_DURATION_THRESHOLD)
    .sort((a, b) => b.creditsUsed - a.creditsUsed);

  const totalCreditsUsed = _queryRecords.reduce((s, q) => s + q.creditsUsed, 0);

  return {
    generatedAt: Math.floor(Date.now() / 1000),
    runStartedAt: _runStartedAt,
    totalCreditsUsed,
    totalQueryCount: _queryRecords.length,
    avgCreditsPerQuery: _queryRecords.length > 0 ? totalCreditsUsed / _queryRecords.length : 0,
    topConsumers: topConsumers.slice(0, 50),
    recentQueries: _queryRecords.slice(-50).reverse(),
    expensiveQueries: expensiveQueries.slice(0, 30),
  };
}

/** Print a summary table to console */
export function printDuneCreditSummary(): void {
  const report = generateDuneCreditReport();
  console.log('\n========== Dune Credit Usage Summary ==========');
  console.log(`Total credits used: ${report.totalCreditsUsed.toFixed(2)}`);
  console.log(`Total queries: ${report.totalQueryCount}`);
  console.log(`Avg credits/query: ${report.avgCreditsPerQuery.toFixed(2)}`);
  if (isFinite(MAX_CREDITS_PER_RUN)) {
    console.log(`Budget: ${report.totalCreditsUsed.toFixed(2)} / ${MAX_CREDITS_PER_RUN} (${(report.totalCreditsUsed / MAX_CREDITS_PER_RUN * 100).toFixed(1)}%)`);
  }
  if (report.topConsumers.length > 0) {
    console.log('\nTop 10 consumers by credits:');
    console.table(
      report.topConsumers.slice(0, 10).map(c => ({
        adapter: c.adapter,
        credits: c.totalCredits.toFixed(2),
        queries: c.queryCount,
        'avg credits': c.avgCreditsPerQuery.toFixed(2),
        'avg duration(s)': c.avgDurationSeconds.toFixed(1),
      }))
    );
  }
  console.log('=================================================\n');
}

/** Fetch billing/usage data directly from Dune API (does not consume credits) */
export async function getDuneCreditUsage(startDate?: string, endDate?: string): Promise<DuneUsageResponse> {
  const body: any = {};
  if (startDate) body.start_date = startDate;
  if (endDate) body.end_date = endDate;
  const { data } = await getAxiosDune().post('/usage', body);
  return data;
}

// ==================== End Credit Tracking ====================

let _axiosDune: any = null;

// this wrapper is to ensure that secret is set before we try to use it
function getAxiosDune() {
  if (_axiosDune) return _axiosDune;

  const API_KEY = getEnv('DUNE_API_KEYS')?.split(',')[0]
  if (!API_KEY) {
    throw new Error("DUNE_API_KEYS environment variable is not set");
  }

  const axiosDune = axios.create({
    headers: {
      "x-dune-api-key": API_KEY,
    },
    baseURL: 'https://api.dune.com/api/v1',
  })

  _axiosDune = axiosDune;
  return _axiosDune;
}

const NOW_TIMESTAMP = Math.trunc((Date.now()) / 1000)

const getLatestData = async (queryId: string) => {

  try {
    const { data: latest_result } = await getAxiosDune().get(`/query/${queryId}/results`)
    const submitted_at = latest_result.submitted_at
    const submitted_at_timestamp = Math.trunc(new Date(submitted_at).getTime() / 1000)
    const diff = NOW_TIMESTAMP - submitted_at_timestamp
    if (diff < 60 * 60 * 3) {
      return latest_result.result.rows
    }
    return undefined
  } catch (e: any) {
    throw e;
  }
}


async function randomDelay() {
  const delay = Math.floor(Math.random() * 5) + 2
  return new Promise((resolve) => setTimeout(resolve, delay * 1000))
}

const inquiryStatus = async (execution_id: string, queryId: string) => {

  let _status = undefined;
  do {
    try {
      const { data } = await getAxiosDune().get(`/execution/${execution_id}/status`)
      _status = data.state
      if (['QUERY_STATE_PENDING', 'QUERY_STATE_EXECUTING'].includes(_status)) {
        console.info(`waiting for query id ${queryId} to complete...`)
        await randomDelay() // 1 - 4s
      }
    } catch (e: any) {
      throw e;
    }
  } while (_status !== 'QUERY_STATE_COMPLETED' && _status !== 'QUERY_STATE_FAILED');
  return _status
}

const submitQuery = async (queryId: string, query_parameters = {}) => {

  const { data: query } = await getAxiosDune().post(`/query/${queryId}/execute`, { query_parameters })
  if (query?.execution_id) {
    return query?.execution_id
  } else {
    console.log("query", query)
    throw new Error("error query data: " + query)
  }
}

// Map to hold batched requests by moduleUID + queryId
const batchedQueries = new Map<string, {
  timer: NodeJS.Timeout;
  requests: Array<{
    parameters: any;
    resolve: (data: any) => void;
    reject: (error: Error) => void;
  }>;
}>();


export function queryDune(queryId: string, query_parameters: any, options: FetchOptions, { extraUIDKey = '' }: { extraUIDKey?: string } = {}) {
  // Set adapter context from FetchOptions for credit attribution
  if (options?.chain) _currentChain = options.chain;

  // Enforce credit budget before executing
  _checkBudget();

  const isBulkMode = getEnv('DUNE_BULK_MODE') === 'true'
  const batchTime = Number(getEnv('DUNE_BULK_MODE_BATCH_TIME') ?? 3_000)

  if (!isBulkMode)
    return _queryDune(queryId, query_parameters);

  return batchDuneQueries(queryId, query_parameters, options);

  async function batchDuneQueries(queryId: string, query_parameters: any, options: FetchOptions) {
    const moduleUID = options.moduleUID;

    if (!moduleUID) {
      return _queryDune(queryId, query_parameters);
    }

    const batchKey = `${options.moduleUID}-${queryId}.${options.chain}-${extraUIDKey}`

    return new Promise((resolve, reject) => {
      if (!batchedQueries.has(batchKey)) {
        const timer = setTimeout(async () => {
          const batch = batchedQueries.get(batchKey)!;
          batchedQueries.delete(batchKey);

          try {
            if (batch.requests.length === 1) {
              const result = await _queryDune(queryId, batch.requests[0].parameters);
              batch.requests[0].resolve(result);
              return;
            }

            log(`[Dune] Executing batched query for ${moduleUID} with ${batch.requests.length} requests`);

            // Combine queries if they have fullQuery parameter
            if (batch.requests.every(r => r.parameters.fullQuery)) {
              const combinedQuery = batch.requests
                .map((r, index) => `(SELECT *, ${index} as _batch_index FROM (${r.parameters.fullQuery}))`)
                .join(' UNION ALL ');

              const startTime = Date.now();
              const results = await _queryDune(queryId, { fullQuery: combinedQuery });
              log(`[Dune] Batched query for ${moduleUID} returned ${results.length} rows took ${(Date.now() - startTime) / 1000}s, batchCount: ${batch.requests.length}`);
              // Split results by _batch_index
              const resultsByIndex = results.reduce((acc: Record<number, any[]>, row: any) => {
                const index = row._batch_index;
                if (!acc[index]) acc[index] = [];

                const { _batch_index, ...rest } = row;
                acc[index].push(rest);
                return acc;
              }, {});

              // Resolve each request with its corresponding results
              batch.requests.forEach((request, index) => {
                request.resolve(resultsByIndex[index] || []);
              });
            } else {
              // Execute individually if can't combine
              for (const request of batch.requests) {
                const result = await _queryDune(queryId, request.parameters);
                request.resolve(result);
              }
            }
          } catch (error) {
            for (const request of batch.requests) {
              request.reject(error as Error);
            }
          }
        }, batchTime)

        batchedQueries.set(batchKey, {
          timer,
          requests: []
        });
      }

      const batch = batchedQueries.get(batchKey)!;
      batch.requests.push({
        parameters: query_parameters,
        resolve,
        reject
      });
    });
  }
}


const _queryDune = async (queryId: string, query_parameters: any = {}) => {
  const adapterName = _currentAdapterName;
  const chain = _currentChain;
  const metadata: any = {
    application: "dune",
    adapter: adapterName,
    chain,
    query_parameters,
  }
  let success = false
  let startTime = +Date.now() / 1e3

  try {
    if (Object.keys(query_parameters).length === 0) {
      const latest_result = await getLatestData(queryId)
      if (latest_result !== undefined) return latest_result
    }
    const execution_id = await submitQuery(queryId, query_parameters)
    const _status = await inquiryStatus(execution_id, queryId)
    if (_status === 'QUERY_STATE_COMPLETED') {
      const { data: { result: { rows, metadata: { column_names, column_types, ...duneMetadata } }, ...restMetadata } } = await getAxiosDune().get(`/execution/${execution_id}/results?limit=100000`)
      success = true
      let endTime = +Date.now() / 1e3
      const durationSeconds = endTime - startTime;

      // Extract credits from Dune response metadata (if available)
      const creditsUsed = (restMetadata as any)?.credits_used ?? (duneMetadata as any)?.credits_used ?? 0;

      // Record query for credit tracking
      _recordQuery({
        queryId,
        adapter: adapterName,
        chain,
        creditsUsed,
        durationSeconds,
        rowsReturned: rows?.length ?? 0,
        timestamp: Math.floor(Date.now() / 1000),
        isBatched: false,
        executionId: execution_id,
      });

      await elastic.addRuntimeLog({
        runtime: durationSeconds, success, metadata: {
          ...restMetadata,
          ...duneMetadata,
          ...metadata,
          rows: rows?.length,
          creditsUsed,
        },
      })
      return rows
    } else if (_status === "QUERY_STATE_FAILED") {
      if (query_parameters.fullQuery) {
        console.log(`Dune query: ${query_parameters.fullQuery}`)
      } else {
        console.log("Dune parameters", query_parameters)
      }
      throw new Error(`Dune query failed: ${queryId}`)
    } else {
      throw new Error(`Dune query failed: ${queryId} unknown state: ${_status}`)
    }

  } catch (e: any) {
    let endTime = +Date.now() / 1e3
    await elastic.addRuntimeLog({ runtime: endTime - startTime, success, metadata, })
    await elastic.addErrorLog({ error: (e?.toString()) as any, metadata, })

    if (e.isAxiosError) {
      let specificErrorMessage = e.message;
      if (e.status === 401) {
        specificErrorMessage = "Dune API Key is invalid";
      }
      const newErr = new Error(e.message);
      (newErr as any).axiosError = specificErrorMessage;
      throw newErr;
    }
    throw e;
  }
}

const tableName = {
  [CHAIN.BSC]: "bnb",
  [CHAIN.ETHEREUM]: "ethereum",
  [CHAIN.BASE]: "base",
  [CHAIN.AVAX]: "avalanche_c"
} as any

export const queryDuneSql = (options: any, query: string, { extraUIDKey }: { extraUIDKey?: string } = {}) => {

  return queryDune("3996608", {
    fullQuery: query.replace("CHAIN", tableName[options.chain] ?? options.chain).split("TIME_RANGE").join(`block_time >= from_unixtime(${options.startTimestamp})
  AND block_time <= from_unixtime(${options.endTimestamp})`)
  }, options, { extraUIDKey })
}

export const queryDuneResult = async (_: any, queryId: string) => {
  const { data: latest_result } = await getAxiosDune().get(`/query/${queryId}/results`)
  return latest_result.result.rows
}

export const getSqlFromFile = (sqlFilePath: string, variables: Record<string, any> = {}): string => {
  try {
    const absolutePath = path.resolve(__dirname, '..', sqlFilePath);
    let sql = fs.readFileSync(absolutePath, 'utf8');

    // Replace variables
    Object.entries(variables).forEach(([key, value]) => {
      sql = sql.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    });

    return sql;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`SQL file not found: ${sqlFilePath}`);
    }
    throw new Error(`Error processing SQL file ${sqlFilePath}: ${error.message}`);
  }
}
