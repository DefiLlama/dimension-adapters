
import axios from 'axios';

async function testKoios() {
  const start = 1700006400; // Some day
  const end = start + 86400;

  console.log(`Fetching blocks from ${start} to ${end}`);

  try {
    const blocksUrl = `https://api.koios.rest/api/v1/blocks?block_time=gte.${start}&block_time=lt.${end}&select=hash`;
    const blocksRes = await axios.get(blocksUrl);
    const hashes = blocksRes.data.map((b: any) => b.hash);
    console.log(`Found ${hashes.length} blocks`);

    if (hashes.length === 0) return;

    // Batch request block_info
    const batchSize = 1000; // Koios limit might be around here
    let totalFees = 0;

    for (let i = 0; i < hashes.length; i += batchSize) {
      const batch = hashes.slice(i, i + batchSize);
      const infoUrl = `https://api.koios.rest/api/v1/block_info`;
      const infoRes = await axios.post(infoUrl, { _block_hashes: batch });
      
      for (const block of infoRes.data) {
        totalFees += Number(block.total_fees);
      }
      console.log(`Processed batch ${i/batchSize + 1}, current total fees: ${totalFees}`);
    }

    console.log(`Total fees (Lovelace): ${totalFees}`);
    console.log(`Total fees (ADA): ${totalFees / 1e6}`);

  } catch (e) {
    console.error(e);
  }
}

testKoios();
