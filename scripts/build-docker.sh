#!/bin/bash

# EDData Collector Docker Build Script
# Creates and manages Docker images for the EDData Collector

set -e

# Configuration
IMAGE_NAME="ghcr.io/eddataapi/eddata-collector"
VERSION=$(node -p "require('./package.json').version")
LATEST_TAG="latest"
DATE_TAG=$(date +%Y%m%d)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 EDData Collector Docker Build Script${NC}"
echo "=================================="

# Functions
build_image() {
    echo -e "${YELLOW}📦 Building Docker image...${NC}"
    docker build \
        --target production \
        --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
        --build-arg VCS_REF=$(git rev-parse --short HEAD) \
        --build-arg VERSION=${VERSION} \
        -t ${IMAGE_NAME}:${VERSION} \
        -t ${IMAGE_NAME}:${DATE_TAG} \
        -t ${IMAGE_NAME}:${LATEST_TAG} \
        .
    
    echo -e "${GREEN}✅ Image built successfully!${NC}"
}

push_image() {
    echo -e "${YELLOW}📤 Pushing Docker image to registry...${NC}"
    docker push ${IMAGE_NAME}:${VERSION}
    docker push ${IMAGE_NAME}:${DATE_TAG}
    docker push ${IMAGE_NAME}:${LATEST_TAG}
    
    echo -e "${GREEN}✅ Images pushed successfully!${NC}"
}

run_tests() {
    echo -e "${YELLOW}🧪 Running tests...${NC}"
    npm test
    
    echo -e "${GREEN}✅ Tests passed!${NC}"
}

scan_security() {
    if command -v trivy &> /dev/null; then
        echo -e "${YELLOW}🔒 Running security scan...${NC}"
        trivy image ${IMAGE_NAME}:${LATEST_TAG}
    else
        echo -e "${YELLOW}⚠️  Trivy not installed, skipping security scan${NC}"
    fi
}

show_help() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  build     Build Docker image"
    echo "  push      Push image to registry (requires build first)"
    echo "  test      Run tests"
    echo "  scan      Run security scan"
    echo "  all       Build, test, scan, and push"
    echo "  help      Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  SKIP_TESTS=true     Skip running tests"
    echo "  SKIP_SCAN=true      Skip security scanning"
}

# Main logic
case "${1:-all}" in
    "build")
        build_image
        ;;
    "push")
        push_image
        ;;
    "test")
        run_tests
        ;;
    "scan")
        scan_security
        ;;
    "all")
        # Complete build process
        if [ "${SKIP_TESTS}" != "true" ]; then
            run_tests
        fi
        
        build_image
        
        if [ "${SKIP_SCAN}" != "true" ]; then
            scan_security
        fi
        
        if [ "${PUSH_IMAGE}" == "true" ]; then
            push_image
        fi
        
        echo -e "${GREEN}🎉 Build process completed!${NC}"
        echo "Built images:"
        echo "  - ${IMAGE_NAME}:${VERSION}"
        echo "  - ${IMAGE_NAME}:${DATE_TAG}"
        echo "  - ${IMAGE_NAME}:${LATEST_TAG}"
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown option: $1${NC}"
        show_help
        exit 1
        ;;
esac