# Ardent Collector

## About this software

The Ardent Collector gathers data submitted to the [Elite Dangerous Data Network](https://github.com/EDCD/EDDN).

Ardent has details for over 150,000,000 star systems and over 30,000,000 trade 
orders for commodities and information across markets on over 300,000 stations,
ports, settlements and fleet carriers throughout the galaxy, with millions of 
updates per day.

The Ardent Collector writes data it gathers to relational databases and 
generates reports from the data (e.g. summaries of commodity supply and demand 
and trade reports for different regions) and provides access to the data via 
the [Ardent API](https://github.com/iaincollins/ardent-api) and raw data dumps.

Related repositories:

* https://github.com/iaincollins/ardent-www
* https://github.com/iaincollins/ardent-api
* https://github.com/iaincollins/ardent-auth

## Notes

This software assumes an internet connection as it attempts to connect to the 
the EDDN (Elite Dangerous Data Network) ZeroMQ instance at 
tcp://eddn.edcd.io:9500 at startup to receive a data stream.

This software requires Node.js v24.11.0 or later. The recommended version is Node.js v24.x, as specified in the `.nvmrc` and `.node-version` files.
The project is tested in CI with Node.js v24.x and the latest LTS release (`lts/*`), and is expected to work with all of these versions.
Dependencies have been updated to ensure compatibility with the latest Node.js releases and modern JavaScript features.

After doing `npm install` you can run the service with `npm start`.

You may need to run `npm run stats` at least once to generate cached data and 
avoid errors being displayed at start up. Database stats are automatically generated 
daily at 6:00 AM, and commodity stats are automatically generated weekly after the 
maintenance window completes.

## Docker

The Ardent Collector is available as a Docker image hosted on GitHub Container Registry.

### Quick Start with Docker

```bash
# Pull the latest image
docker pull ghcr.io/edtoolbox/ardent-collector:latest

# Run with Docker
docker run -d \
  --name ardent-collector \
  -p 3002:3002 \
  -v ardent-data:/app/ardent-data \
  -v ardent-backup:/app/ardent-backup \
  -v ardent-downloads:/app/ardent-downloads \
  ghcr.io/edtoolbox/ardent-collector:latest
```

### Using Docker Compose

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

### Building Locally

```bash
# Build the image
docker build -t ardent-collector .

# Run locally built image
docker run -d -p 3002:3002 ardent-collector
```

### Environment Variables

You can configure the collector using environment variables:

- `NODE_ENV`: Set to `production` for production use
- `ARDENT_COLLECTOR_LOCAL_PORT`: Port to listen on (default: 3002)
- `EDDN_SERVER`: EDDN server URL (default: tcp://eddn.edcd.io:9500)

See `lib/consts.js` for all available configuration options.

## Credits

_This software would not be possible without work from dozens of enthusiasts 
and hundreds of open source contributors._

Special thanks to Elite Dangerous Community Developers members, Elite 
Dangerous Data Network maintainers, Anthor (Elite Dangerous Star Map) 
and Gareth Harper (Spansh).

Thank you to all those who have created and supported libraries on which this 
software depends and to Frontier Developments plc for supporting third party 
tools.

## Legal

Copyright Iain Collins, 2023.

This software has been released under the GNU Affero General Public License.

Elite Dangerous is copyright Frontier Developments plc. This software is 
not endorsed by nor reflects the views or opinions of Frontier Developments and 
no employee of Frontier Developments was involved in the making of it.
