require('dotenv').config()
import thorchainAdapter from './fees/thorchain'
import runAdapter from './adapters/utils/runAdapter'
import { getUniqStartOfTodayTimestamp } from './helpers/getUniSubgraphVolume'

/**
 * Test script for THORCHAIN fee adapter
 * This script fetches daily fees and revenue for THORCHAIN
 */

function toTimestamp(timeArg?: string) {
  if (!timeArg) {
    return getUniqStartOfTodayTimestamp(new Date())
  }
  if (Number.isNaN(Number(timeArg))) {
    return Math.round(new Date(timeArg).getTime() / 1e3)
  } else {
    return Number(timeArg)
  }
}

async function testThorchainFees(dateArg?: string) {
  try {
    const endTimestamp = toTimestamp(dateArg)
    const date = new Date(endTimestamp * 1000)
    
    console.log('🦙 Testing THORCHAIN Fee Adapter 🦙')
    console.log('=====================================')
    console.log(`Test Date: ${date.toUTCString()}`)
    console.log(`Timestamp: ${endTimestamp}`)
    console.log('=====================================\n')

    // Run the adapter
    const results = await runAdapter({
      module: thorchainAdapter,
      endTimestamp,
      isTest: true,
      withMetadata: false,
    })

    // Display results
    if (results && results.length > 0) {
      const result = results[0]
      
      console.log('\n📊 Results:')
      console.log('=====================================')
      console.log(`Chain: ${result.chain}`)
      console.log(`Timestamp: ${result.timestamp}`)
      console.log(`Date: ${new Date(result.timestamp * 1000).toUTCString()}`)
      
      // Process all fee/revenue metrics
      const metrics = [
        { key: 'dailyFees', label: '💰 Daily Fees', icon: '💰' },
        { key: 'dailyRevenue', label: '💵 Daily Revenue', icon: '💵' },
        { key: 'dailyProtocolRevenue', label: '🏛️  Daily Protocol Revenue', icon: '🏛️ ' },
        { key: 'dailyHoldersRevenue', label: '👥 Daily Holders Revenue', icon: '👥' },
        { key: 'dailySupplySideRevenue', label: '📈 Daily Supply Side Revenue', icon: '📈' },
        { key: 'dailyUserFees', label: '👤 Daily User Fees', icon: '👤' },
      ]

      for (const metric of metrics) {
        if (result[metric.key] !== undefined) {
          const value = await getUSDValue(result[metric.key])
          console.log(`${metric.icon} ${metric.label}: $${formatNumber(value)}`)
        }
      }
      
      console.log('\n=====================================')
      console.log('\n✅ Test completed successfully!')
      
      // Show full result object for debugging (excluding Balances objects)
      console.log('\n📋 Full Result Object:')
      const serializableResult = { ...result }
      for (const key in serializableResult) {
        if (serializableResult[key] && typeof serializableResult[key] === 'object' && typeof serializableResult[key].getUSDJSONs === 'function') {
          try {
            const { usdTvl, usdTokenBalances } = await serializableResult[key].getUSDJSONs()
            serializableResult[key] = { 
              type: 'Balances',
              usdValue: usdTvl,
              tokenBreakdown: usdTokenBalances
            }
          } catch (e) {
            serializableResult[key] = '[Balances object - could not serialize]'
          }
        }
      }
      console.log(JSON.stringify(serializableResult, null, 2))
    } else {
      console.log('❌ No results returned')
    }
  } catch (error: any) {
    console.error('\n❌ Error testing adapter:')
    console.error(error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack.split('\n').slice(0, 5).join('\n'))
    }
    process.exit(1)
  }
}

async function getUSDValue(value: any): Promise<number> {
  // Handle Balances object (from @defillama/sdk)
  if (value && typeof value.getUSDJSONs === 'function') {
    try {
      const result = await value.getUSDJSONs()
      return result.usdTvl || 0
    } catch (e: any) {
      console.warn(`Warning: Could not get USD value from Balances object: ${e.message}`)
      // Fall through to try other methods
    }
  }
  
  // If it's already a number, return it
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value
  }
  
  // If it's a string, try to parse it
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? 0 : parsed
  }
  
  // If it's an object with a value property
  if (value && typeof value === 'object' && 'value' in value) {
    return await getUSDValue(value.value)
  }
  
  return 0
}

function formatNumber(num: number): string {
  if (num === 0) return '0'
  if (num < 0.01) return num.toExponential(2)
  if (num < 1000) return num.toFixed(2)
  if (num < 1000000) return (num / 1000).toFixed(2) + 'K'
  if (num < 1000000000) return (num / 1000000).toFixed(2) + 'M'
  return (num / 1000000000).toFixed(2) + 'B'
}

// Get date from command line argument or use today
const dateArg = process.argv[2]
testThorchainFees(dateArg).then(() => {
  process.exit(0)
}).catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

