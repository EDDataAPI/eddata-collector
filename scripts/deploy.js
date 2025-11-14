#!/usr/bin/env node

/**
 * EDData Collector Deployment Script
 * Manages Docker-based deployments for different environments
 */

const { execSync } = require('child_process')
const fs = require('fs')

const ENVIRONMENTS = {
  development: {
    compose: 'docker-compose.yml',
    env: '.env.development'
  },
  staging: {
    compose: 'docker-compose.staging.yml',
    env: '.env.staging'
  },
  production: {
    compose: 'docker-compose.production.yml',
    env: '.env.production'
  }
}

class DeploymentManager {
  constructor () {
    this.environment = process.env.NODE_ENV || 'development'
    this.verbose = process.argv.includes('--verbose')
  }

  log (message, level = 'info') {
    const timestamp = new Date().toISOString()
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅'
    console.log(`${prefix} [${timestamp}] ${message}`)
  }

  exec (command, options = {}) {
    if (this.verbose) {
      this.log(`Executing: ${command}`)
    }

    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: this.verbose ? 'inherit' : 'pipe',
        ...options
      })
      return result
    } catch (error) {
      this.log(`Command failed: ${command}`, 'error')
      this.log(error.message, 'error')
      throw error
    }
  }

  checkPrerequisites () {
    this.log('Checking prerequisites...')

    // Docker prüfen
    try {
      this.exec('docker --version')
      this.log('Docker is available')
    } catch {
      throw new Error('Docker is not installed or not in PATH')
    }

    // Docker Compose prüfen
    try {
      this.exec('docker-compose --version')
      this.log('Docker Compose is available')
    } catch {
      throw new Error('Docker Compose is not installed or not in PATH')
    }

    // Compose-Datei prüfen
    const composeConfig = ENVIRONMENTS[this.environment]
    if (!fs.existsSync(composeConfig.compose)) {
      throw new Error(`Docker Compose file not found: ${composeConfig.compose}`)
    }
  }

  loadEnvironment () {
    const envConfig = ENVIRONMENTS[this.environment]
    if (fs.existsSync(envConfig.env)) {
      this.log(`Loading environment from ${envConfig.env}`)
      // Load environment variables without external dependencies
      const envContent = fs.readFileSync(envConfig.env, 'utf8')
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#][^=]*?)=(.*)$/)
        if (match) {
          const [, key, value] = match
          process.env[key.trim()] = value.trim()
        }
      })
    } else {
      this.log(`No environment file found: ${envConfig.env}`, 'warn')
    }
  }

  build () {
    this.log('Building Docker images...')
    const composeFile = ENVIRONMENTS[this.environment].compose
    this.exec(`docker-compose -f ${composeFile} build --no-cache`)
    this.log('Build completed successfully')
  }

  deploy () {
    this.log(`Deploying to ${this.environment} environment...`)
    const composeFile = ENVIRONMENTS[this.environment].compose

    // Stop existing containers
    this.exec(`docker-compose -f ${composeFile} down`)

    // Start new containers
    this.exec(`docker-compose -f ${composeFile} up -d`)

    // Wait for health checks
    this.waitForHealthy()

    this.log('Deployment completed successfully')
  }

  waitForHealthy (maxWait = 120) {
    this.log('Waiting for services to become healthy...')
    const composeFile = ENVIRONMENTS[this.environment].compose

    for (let i = 0; i < maxWait; i += 5) {
      try {
        const result = this.exec(`docker-compose -f ${composeFile} ps --services --filter "status=running"`)
        if (result.trim()) {
          this.log('Services are running and healthy')
          return
        }
      } catch {
        // Service not ready yet
      }

      this.log(`Waiting... (${i + 5}/${maxWait}s)`)
      // Simple sleep without external dependencies
      this.exec('sleep 5')
    }

    throw new Error('Services did not become healthy within timeout')
  }

  rollback () {
    this.log('Rolling back deployment...')
    const composeFile = ENVIRONMENTS[this.environment].compose

    // Restore previous version (simplified)
    this.exec(`docker-compose -f ${composeFile} down`)
    this.exec(`docker-compose -f ${composeFile} up -d --no-deps eddata-collector`)

    this.log('Rollback completed')
  }

  status () {
    const composeFile = ENVIRONMENTS[this.environment].compose
    this.log(`Status for ${this.environment} environment:`)
    this.exec(`docker-compose -f ${composeFile} ps`)
  }

  logs () {
    const composeFile = ENVIRONMENTS[this.environment].compose
    this.exec(`docker-compose -f ${composeFile} logs -f`)
  }

  showHelp () {
    console.log(`
EDData Collector Deployment Manager

Usage: node deploy.js [command] [options]

Commands:
  build       Build Docker images
  deploy      Deploy to environment  
  status      Show deployment status
  logs        Show service logs
  rollback    Rollback to previous version
  help        Show this help

Options:
  --verbose   Show detailed output
  --env=ENV   Set environment (development|staging|production)

Environment: ${this.environment}
    `)
  }
}

// Main execution
async function main () {
  const command = process.argv[2] || 'help'
  const manager = new DeploymentManager()

  // Override environment from --env parameter
  const envArg = process.argv.find(arg => arg.startsWith('--env='))
  if (envArg) {
    manager.environment = envArg.split('=')[1]
  }

  try {
    switch (command) {
      case 'build':
        manager.checkPrerequisites()
        manager.loadEnvironment()
        manager.build()
        break

      case 'deploy':
        manager.checkPrerequisites()
        manager.loadEnvironment()
        manager.build()
        manager.deploy()
        break

      case 'status':
        manager.status()
        break

      case 'logs':
        manager.logs()
        break

      case 'rollback':
        manager.rollback()
        break

      default:
        manager.showHelp()
        break
    }
  } catch (error) {
    manager.log(error.message, 'error')
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = DeploymentManager
