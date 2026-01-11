#!/usr/bin/env node
/**
 * Upload compressed database backups to Cloudflare R2
 * 
 * Required environment variables:
 * - CLOUDFLARE_R2_ACCOUNT_ID
 * - CLOUDFLARE_R2_ACCESS_KEY_ID
 * - CLOUDFLARE_R2_SECRET_ACCESS_KEY
 * - CLOUDFLARE_R2_BUCKET_NAME
 * - CLOUDFLARE_R2_PUBLIC_URL (optional, for public access)
 */

const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')
const getFileHash = require('../lib/utils/get-file-hash')
const byteSize = require('byte-size')

const {
  EDDATA_DOWNLOADS_DIR,
  EDDATA_DOWNLOADS_BASE_URL
} = require('../lib/consts')

// R2 Configuration (compatible with S3 API)
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'eddata-backups'
const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL || `https://pub-${R2_ACCOUNT_ID}.r2.dev`

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('❌ Missing required Cloudflare R2 credentials!')
  console.error('Required environment variables:')
  console.error('  - CLOUDFLARE_R2_ACCOUNT_ID')
  console.error('  - CLOUDFLARE_R2_ACCESS_KEY_ID')
  console.error('  - CLOUDFLARE_R2_SECRET_ACCESS_KEY')
  process.exit(1)
}

// Initialize R2 client (using S3-compatible API)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
})

const compressedBackups = [
  'locations.db.gz',
  'stations.db.gz',
  'systems.db.gz',
  'trade.db.gz'
]

async function uploadToR2 (filePath, key) {
  const fileStream = fs.createReadStream(filePath)
  const stats = fs.statSync(filePath)

  console.log(`Uploading ${key} (${byteSize(stats.size)})...`)
  console.time(`Uploaded ${key}`)

  try {
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fileStream,
      ContentType: 'application/gzip',
      ContentLength: stats.size,
      // Cache for 1 hour, allow stale for 24 hours
      CacheControl: 'public, max-age=3600, stale-while-revalidate=86400',
      Metadata: {
        'original-name': path.basename(filePath),
        'upload-date': new Date().toISOString()
      }
    }))

    console.timeEnd(`Uploaded ${key}`)
    return true
  } catch (error) {
    console.error(`Failed to upload ${key}:`, error.message)
    return false
  }
}

async function checkIfExists (key) {
  try {
    await r2Client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key
    }))
    return true
  } catch (error) {
    return false
  }
}

;(async () => {
  console.log('📤 Uploading backups to Cloudflare R2...')
  console.log(`   Bucket: ${R2_BUCKET_NAME}`)
  console.log(`   Public URL: ${R2_PUBLIC_URL}`)
  console.time('Total upload time')

  const manifest = {}
  let uploadedCount = 0
  let skippedCount = 0

  for (const filename of compressedBackups) {
    const filePath = path.join(EDDATA_DOWNLOADS_DIR, filename)

    // Check if compressed backup exists
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Skipping ${filename} - file not found`)
      continue
    }

    const stats = fs.statSync(filePath)
    const key = filename // Store with same name in R2

    // Optional: Check if file already exists (skip if unchanged)
    const exists = await checkIfExists(key)
    if (exists) {
      console.log(`ℹ️  ${filename} already exists in R2 - overwriting...`)
    }

    const success = await uploadToR2(filePath, key)

    if (success) {
      uploadedCount++
      
      // Generate manifest entry
      const sha256 = await getFileHash(filePath)
      manifest[path.basename(filename, '.gz')] = {
        name: path.basename(filename, '.gz'),
        url: `${R2_PUBLIC_URL}/${key}`,
        size: stats.size,
        created: stats.ctime,
        sha256
      }
    } else {
      skippedCount++
    }
  }

  // Upload manifest to R2
  if (Object.keys(manifest).length > 0) {
    const manifestPath = path.join(EDDATA_DOWNLOADS_DIR, 'downloads.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    console.log(`\n📄 Uploading manifest (${Object.keys(manifest).length} entries)...`)
    
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2))
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: 'downloads.json',
      Body: manifestBuffer,
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300', // Cache for 5 minutes
      Metadata: {
        'generated-at': new Date().toISOString()
      }
    }))
    
    console.log(`✅ Manifest uploaded: ${R2_PUBLIC_URL}/downloads.json`)
  }

  console.timeEnd('Total upload time')
  console.log(`\n✨ Upload complete!`)
  console.log(`   Uploaded: ${uploadedCount}`)
  console.log(`   Skipped: ${skippedCount}`)
  console.log(`\n🌐 Public downloads available at: ${R2_PUBLIC_URL}/`)

  process.exit(0)
})()
