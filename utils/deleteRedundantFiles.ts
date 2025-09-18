import { AdapterType } from "../adapters/types";
import { promises as fs } from 'fs';
import * as path from 'path';


async function run() {
 const dirs = Object.values(AdapterType).filter(i => i !== AdapterType.DERIVATIVES && i !== AdapterType.PROTOCOLS)

// Global object to store results by directory
const filesByDirectory: Record<string, Record<string, {
  path: string,
  content?: string,
  lineCount: number
  key: string
}>> = {};

for (const dir of dirs) {
  // Initialize directory entry
  filesByDirectory[dir] = {};
  
  const dirPath = path.join(__dirname, '..', dir);
  
  try {
    // Get all items in the directory
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      const key = item.name; // Key is the top-level file/folder name
      
      if (item.isFile()) {
        // Process top-level file
        const content = await fs.readFile(itemPath, 'utf-8');
        const lineCount = content.split('\n').length;
        
        filesByDirectory[dir][key] = {
          key,
          path: itemPath,
          lineCount,
          content: lineCount <= 20 ? content : undefined,
        };
      } else if (item.isDirectory()) {
        // Check for index files one level down
        for (const indexFile of ['index.js', 'index.ts']) {
          const indexPath = path.join(itemPath, indexFile);
          
          try {
            // Check if index file exists
            await fs.stat(indexPath);
            
            // Read and process index file
            const content = await fs.readFile(indexPath, 'utf-8');
            const hasBreakdownData = content.includes('...rest')
            const lineCount = content.split('\n').length + (hasBreakdownData ? 200 : 0);

            filesByDirectory[dir][key] = {
              key,
              path: indexPath,
              lineCount,
              content: lineCount <= 20 ? content : undefined,
            };
            
            break; // Use first index file found
          } catch (e) {
            // Index file does not exist, ignore
          }
        }
      }
    }
  } catch (e) {
    console.error(`Error processing directory ${dir}:`, e);
  }
}

console.log('Files collected:', 
  Object.keys(filesByDirectory).map(dir => 
    `${dir}: ${Object.keys(filesByDirectory[dir]).length} files`
  ).join(', ')
);

// Find duplicate files with less than 20 lines across directories
console.log('\nChecking for duplicate files with less than 20 lines...');

// Group files by key across directories
const filesByKey: Record<string, Array<{
  key: string;
  dir: string;
  path: string;
  lineCount: number;
  content?: string;
}>> = {};

// Build the filesByKey structure
for (const dir of Object.keys(filesByDirectory)) {
  for (const [key, fileInfo] of Object.entries(filesByDirectory[dir])) {
    if (!filesByKey[key]) {
      filesByKey[key] = [];
    }
    
    filesByKey[key].push({
      key,
      dir,
      path: fileInfo.path,
      lineCount: fileInfo.lineCount,
      content: fileInfo.content
    });
  }
}

// Process keys that appear in multiple directories
let deletionCount = 0;

for (const [key, files] of Object.entries(filesByKey)) {
  // Skip if the key only appears in one directory
  if (files.length <= 1) continue;
  
  // Find files with less than 20 lines
  const smallFiles = files.filter(file => file.lineCount < 20);
  
  // Skip if no files have less than 20 lines
  if (smallFiles.length === 0) continue;
  
  // console.log(`\nFound duplicate key: ${key}`);
  // console.log(`Found in ${files.length} directories`);
  
  // Keep track of directories with larger files
  const largeFileDirectories = new Set(
    files.filter(f => f.lineCount >= 20).map(f => f.dir)
  );
  
  // Process each small file
  for (const file of smallFiles) {
    let content = file.content;
    if (!content 
      || (content.includes('...rest') && content.includes('breakdown')) 
      || content.includes('/helpers/')
      || content.includes('methodology')
    ) continue;
    // console.log(`  Directory: ${file.dir}, Path: ${file.path}, Lines: ${file.lineCount}`);
    
    // if (file.content) {
    //   console.log('    Content:');
    //   console.log(`    ${file.content.replace(/\n/g, '\n    ')}`);
    // }
    
    // Only delete if there's at least one other copy (either small or large)
    const shouldDelete = largeFileDirectories.size > 0 || 
                        smallFiles.some(f => f !== file);
    
    if (shouldDelete) {
      try {
        console.log(`  Deleting: lines: ${file.lineCount} ${file.dir}/${file.key} `);
        // await fs.unlink(file.path);
        deletionCount++;
      } catch (e) {
        console.error(`  Failed to delete ${file.path}:`, e);
      }
    } else {
      console.log(`  Keeping: ${file.path} (only copy)`);
    }
  }
}

console.log(`\nDeleted ${deletionCount} redundant files.`);
}

run().catch(console.error).then(() => process.exit(0));