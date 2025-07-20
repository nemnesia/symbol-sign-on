#!/bin/bash

# MongoDB Docker Compose管理スクリプト

set -e

COMPOSE_FILE="docker-compose.dev.yml"

case "$1" in
    "start")
        echo "Starting MongoDB..."
        docker-compose -f $COMPOSE_FILE up -d
        echo "MongoDB started successfully!"
        echo "MongoDB: http://localhost:27017"
        echo "Mongo Express: http://localhost:8081"
        ;;
    "stop")
        echo "Stopping MongoDB..."
        docker-compose -f $COMPOSE_FILE down
        echo "MongoDB stopped successfully!"
        ;;
    "restart")
        echo "Restarting MongoDB..."
        docker-compose -f $COMPOSE_FILE down
        docker-compose -f $COMPOSE_FILE up -d
        echo "MongoDB restarted successfully!"
        ;;
    "logs")
        echo "Showing MongoDB logs..."
        docker-compose -f $COMPOSE_FILE logs -f
        ;;
    "reset")
        echo "Resetting MongoDB data..."
        docker-compose -f $COMPOSE_FILE down -v
        docker-compose -f $COMPOSE_FILE up -d
        echo "MongoDB reset successfully!"
        ;;
    "status")
        echo "MongoDB container status:"
        docker-compose -f $COMPOSE_FILE ps
        ;;
    "shell")
        echo "Connecting to MongoDB shell..."
        docker exec -it symbol-sign-on-mongodb mongosh -u admin -p password symbol_sign_on
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|reset|status|shell}"
        echo ""
        echo "Commands:"
        echo "  start   - Start MongoDB containers"
        echo "  stop    - Stop MongoDB containers"
        echo "  restart - Restart MongoDB containers"
        echo "  logs    - Show MongoDB logs"
        echo "  reset   - Reset MongoDB data (WARNING: All data will be lost)"
        echo "  status  - Show container status"
        echo "  shell   - Connect to MongoDB shell"
        exit 1
        ;;
esac
