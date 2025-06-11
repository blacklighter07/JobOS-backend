#!/bin/bash

# Job OS Backend Docker Startup Script

echo "🚀 Starting Job OS Backend..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Stop existing containers if running
echo "📦 Stopping existing containers..."
docker-compose down

# Build and start containers
echo "🔨 Building and starting containers..."
docker-compose up --build -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 10

# Check container status
echo "📋 Container Status:"
docker-compose ps

echo ""
echo "✅ Job OS Backend started successfully!"
echo ""
echo "🌐 Backend URL: http://localhost:5001"
echo "📱 Mobile API: http://localhost:5001/api/mobile"
echo "📄 API Docs: http://localhost:5001/api"
echo ""
echo "📊 Database:"
echo "   MongoDB: localhost:27017"
echo "   Redis: localhost:6379"
echo ""
echo "🔧 Useful commands:"
echo "   View logs: docker-compose logs -f job-os-backend"
echo "   Stop: docker-compose down"
echo "   Restart: docker-compose restart"
echo ""

# Show recent logs
echo "📋 Recent logs:"
docker-compose logs --tail=20 job-os-backend 