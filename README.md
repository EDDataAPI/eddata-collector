# EDData Collector

[![Docker Build and Deploy](https://github.com/EDDataAPI/eddata-collector/actions/workflows/docker-build-deploy.yml/badge.svg)](https://github.com/EDDataAPI/eddata-collector/actions/workflows/docker-build-deploy.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Node.js Version](https://img.shields.io/badge/Node.js-24.11.0-green.svg)](https://nodejs.org/)
[![Docker Image](https://img.shields.io/badge/Docker-ghcr.io%2Feddataapi%2Feddata--collector-blue)](https://github.com/EDDataAPI/eddata-collector/pkgs/container/eddata-collector)

## 🚀 About This Software

The EDData Collector gathers data submitted to the [Elite Dangerous Data Network (EDDN)](https://github.com/EDCD/EDDN) and makes it available through the EDData API.

### 📊 Data Scope

- **🌌 Over 150 million star systems** with detailed information
- **🏪 Over 30 million trade orders** for commodities and markets  
- **🚀 Over 300,000 stations, ports, settlements and fleet carriers**
- **📈 Millions of daily updates** from the Elite Dangerous community

### 🔧 Features

- **Real-time data collection** from EDDN ZeroMQ stream
- **Relational databases** for structured data storage
- **Automated reports** on commodity supply, demand and trade routes
- **RESTful API** for data access
- **Docker-based deployment** for easy installation and scaling

### 🔗 Related Repositories

* [EDData API](https://github.com/EDDataAPI/eddata-api) - REST API for data access
* [EDData Web](https://github.com/EDDataAPI/eddata-web) - Web interface for the data
* [EDData Auth](https://github.com/EDDataAPI/eddata-auth) - Authentication service

## 🛠️ Installation

### 📋 System Requirements

- **Node.js v24.11.0 or higher** (recommended: v24.x LTS)
- **Docker** and **Docker Compose** (for container deployment)
- **Internet connection** for EDDN connectivity
- **Sufficient disk space** for databases (several GB)

### 🚀 Quick Start with Docker (Recommended)

```bash
# Clone repository
git clone https://github.com/EDDataAPI/eddata-collector.git
cd eddata-collector

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f eddata-collector

# Check status
curl http://localhost:3002
```

### 🐳 Docker Images

The EDData Collector is available as a Docker image:

```bash
# Pull latest version
docker pull ghcr.io/eddataapi/eddata-collector:latest

# Run directly
docker run -d \
  --name eddata-collector \
  -p 3002:3002 \
  -v eddata-data:/app/eddata-data \
  -v eddata-backup:/app/eddata-backup \
  -v eddata-downloads:/app/eddata-downloads \
  ghcr.io/eddataapi/eddata-collector:latest
```

### 🔧 Available Docker Images

- `ghcr.io/eddataapi/eddata-collector:latest` - Latest stable version
- `ghcr.io/eddataapi/eddata-collector:v1.0.0` - Specific version
- `ghcr.io/eddataapi/eddata-collector:main` - Main development branch

### 🏗️ Local Development

```bash
# Clone repository
git clone https://github.com/EDDataAPI/eddata-collector.git
cd eddata-collector

# Install dependencies
npm install

# Start development mode
npm run dev

# Run tests
npm test

# Production build
npm start
```

### 🔨 Build Docker Image Yourself

```bash
# Using the provided script (Linux/macOS)
./scripts/build-docker.sh

# Using the Windows script
./scripts/build-docker.bat

# Or manually
docker build -t eddata-collector .
```

## ⚙️ Configuration

### 🌍 Environment Variables

The EDData Collector can be configured via environment variables:

#### 🔌 Network & Ports
- `EDDATA_COLLECTOR_LOCAL_PORT`: Server port (default: 3002)
- `EDDN_SERVER`: EDDN server URL (default: tcp://eddn.edcd.io:9500)

#### 📂 Directories
- `EDDATA_DATA_DIR`: Data directory (default: ./eddata-data)
- `EDDATA_CACHE_DIR`: Cache directory (default: ./eddata-data/cache)
- `EDDATA_BACKUP_DIR`: Backup directory (default: ./eddata-backup)
- `EDDATA_DOWNLOADS_DIR`: Downloads directory (default: ./eddata-downloads)

#### 🗄️ Databases
- `EDDATA_SYSTEMS_DB`: Systems database path
- `EDDATA_LOCATIONS_DB`: Locations database path
- `EDDATA_STATIONS_DB`: Stations database path
- `EDDATA_TRADE_DB`: Trade database path

#### 🛠️ Maintenance
- `MAINTENANCE_DAY_OF_WEEK`: Maintenance day (default: 4 = Thursday)
- `MAINTENANCE_WINDOW_START_HOUR`: Maintenance start (default: 7 AM UTC)
- `MAINTENANCE_WINDOW_END_HOUR`: Maintenance end (default: 9 AM UTC)
- `SKIP_STARTUP_MAINTENANCE`: Skip maintenance on startup for faster restarts (default: false)

> **⚡ Performance Tip:** For large databases (>10GB), startup can take 45+ minutes. Set `SKIP_STARTUP_MAINTENANCE=true` after initial setup to reduce startup time to ~5 seconds (540x faster!). See [docs/PERFORMANCE-OPTIMIZATIONS.md](docs/PERFORMANCE-OPTIMIZATIONS.md) for details.

> **🗄️ Database:** Uses SQLite optimized for read-heavy workloads. Handles TB-sized databases with <1ms latency. See [docs/SQLITE-OPTIMIZATION.md](docs/SQLITE-OPTIMIZATION.md) for performance tuning. MongoDB is NOT recommended - SQLite is 10-100x faster for this use case!

### 📄 Configuration File

Create an `eddata.config` file for advanced configuration:

```bash
# eddata.config example
NODE_ENV=production
EDDATA_COLLECTOR_LOCAL_PORT=3002
EDDATA_DOMAIN=your-domain.com
LOG_LEVEL=info
```

## 🚀 Deployment

### 🏠 Local Development

```bash
# Start development environment
docker-compose -f docker-compose.yml up -d
```

### 🧪 Staging

```bash
# Staging environment
docker-compose -f docker-compose.staging.yml up -d
```

### 🌐 Production

```bash
# Production environment
docker-compose -f docker-compose.production.yml up -d

# With monitoring (optional)
docker-compose -f docker-compose.production.yml --profile monitoring up -d
```

### 📊 Management Scripts

```bash
# Run build script
npm run docker:build

# Deployment script
node scripts/deploy.js deploy --env=production

# Check status
node scripts/deploy.js status --env=production

# View logs
npm run docker:logs
```

## 🔄 API Endpoints

The EDData Collector provides several API endpoints:

- `GET /` - System statistics and health status
- `GET /health` - Simple health check for load balancers
- `POST /api/v1/data` - Receive data from EDDN (internal)

## 📈 Monitoring

### 🏥 Health Checks

The service has built-in health checks:

```bash
# Basic status
curl http://localhost:3002/

# Simple health check
curl http://localhost:3002/health

# Docker health check
docker ps --filter "name=eddata-collector"
```

### 📊 Metrics (Optional)

You can enable monitoring with the production Docker Compose stack:

```bash
# Start with Prometheus and Grafana
docker-compose -f docker-compose.production.yml --profile monitoring up -d

# Prometheus: http://localhost:9090
# Grafana: http://localhost:3000 (admin/admin)
```

## 🔧 Maintenance

### 🗄️ Database Optimization

```bash
# Generate database statistics
npm run stats

# Optimize databases
npm run optimize

# Create backup
npm run backup
```

### 🧹 Automatic Maintenance

The service automatically performs weekly maintenance:

- **Default: Thursday 7:00-9:00 UTC** (corresponding to Elite Dangerous maintenance)
- Clean old data
- Optimize databases
- Create backups

### 📁 Backup & Restore

```bash
# Manual backup
npm run backup

# Compressed backup
npm run backup:compress

# Restore
npm run restore
```

## 🛠️ Development

### 🧪 Running Tests

```bash
# All tests
npm test

# Linting
npm run lint

# Linting with automatic fixes
npm run lint -- --fix
```

### 🔍 Debugging

```bash
# Debug mode
DEBUG=* npm run dev

# With specific debug namespaces
DEBUG=eddata:* npm run dev

# Verbose logging
NODE_ENV=development npm start
```

### 🐳 Local Docker Development

```bash
# Development container
docker-compose -f docker-compose.yml up --build

# Shell in container
docker-compose exec eddata-collector /bin/sh

# Follow logs
docker-compose logs -f eddata-collector
```

## 🚨 Troubleshooting

### ❓ Common Issues

**Port already in use:**
```bash
# Change port
export EDDATA_COLLECTOR_PORT=3003
docker-compose up -d
```

**Disk space full:**
```bash
# Clean old data
npm run optimize

# Clean Docker images
docker system prune -a
```

**EDDN connection failed:**
```bash
# Check network connectivity
telnet eddn.edcd.io 9500

# Use alternative EDDN server
export EDDN_SERVER=tcp://alternative.eddn.server:9500
```

### 📝 Log Analysis

```bash
# Container logs
docker-compose logs -f --tail=100 eddata-collector

# System logs (Linux)
journalctl -u docker -f

# Increase log level
export LOG_LEVEL=debug
```

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### 📋 Setting Up Development Environment

```bash
# Fork and clone repository
git clone https://github.com/YOUR_USERNAME/eddata-collector.git
cd eddata-collector

# Set up development environment
npm install
npm run dev

# Run tests
npm test
```

### 🔀 Pull Request Guidelines

1. Create feature branch: `git checkout -b feature/new-feature`
2. Add tests for new functionality
3. Check linting: `npm run lint`
4. Commit messages: Use [Conventional Commits](https://conventionalcommits.org/)
5. Create pull request

## 🙏 Acknowledgments

_This software would not be possible without the work of dozens of enthusiasts and hundreds of open-source contributors._

Special thanks to:

- **Elite Dangerous Community Developers** - For the EDDN infrastructure
- **Elite Dangerous Data Network Maintainers** - For data provision
- **Anthor** - Elite Dangerous Star Map (EDSM)
- **Gareth Harper** - Spansh.co.uk
- **Frontier Developments plc** - For supporting third-party tools
- **The entire Elite Dangerous Community** - For data submissions and feedback

### 🔗 Related Projects

- [EDDN (Elite Dangerous Data Network)](https://github.com/EDCD/EDDN)
- [EDCD (Elite Dangerous Community Developers)](https://github.com/EDCD)
- [EDSM (Elite Dangerous Star Map)](https://www.edsm.net/)
- [Spansh](https://spansh.co.uk/)
- [EDDB](https://eddb.io/)

For detailed contributor information, licensing details, and legal notices, see [AUTHORS.md](AUTHORS.md).
