#!/bin/bash

# Define variables
PROJECT_DIR="/home/ginto/kto-poblizhe" # Should ideally be detected, but hardcoding for now
SERVICE_NAME="game.service"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
SERVICE_FILE_PATH="$SYSTEMD_USER_DIR/$SERVICE_NAME"

# Function to update and restart the service
update_and_restart() {
  echo "--> Navigating to project directory: $PROJECT_DIR"
  cd "$PROJECT_DIR" || { echo "Error: Could not cd to $PROJECT_DIR"; exit 1; }

  echo "--> Pulling latest changes from git..."
  git pull || { echo "Error: git pull failed"; exit 1; }

  # Optional: Add npm install if dependencies might change
  echo "--> Installing/updating dependencies..."
  if [ -f "package-lock.json" ]; then
    npm ci --production || { echo "Error: npm ci failed"; exit 1; }
  else
    npm install --production || { echo "Error: npm install failed"; exit 1; }
  fi


  echo "--> Restarting systemd service '$SERVICE_NAME'..."
  systemctl --user restart "$SERVICE_NAME"

  # Check status briefly after restart
  sleep 2 # Give it a moment to start/fail
  echo "--> Current service status:"
  systemctl --user status "$SERVICE_NAME" --no-pager | head -n 5 # Show first few lines
}

# Function to show logs using journalctl
show_logs() {
  echo "--> Showing logs for '$SERVICE_NAME' (Press Ctrl+C to stop)..."
  journalctl --user -u "$SERVICE_NAME" -f -n 50 # Show last 50 lines and follow
}

# Function to stop the service
stop_service() {
    echo "--> Stopping systemd service '$SERVICE_NAME'..."
    systemctl --user stop "$SERVICE_NAME"
    echo "--> Current service status:"
    systemctl --user status "$SERVICE_NAME" --no-pager | head -n 5
}

# Function to start the service (if stopped)
start_service() {
    echo "--> Starting systemd service '$SERVICE_NAME'..."
    systemctl --user start "$SERVICE_NAME"
    echo "--> Current service status:"
    systemctl --user status "$SERVICE_NAME" --no-pager | head -n 5
}

# Function to setup the systemd service
setup_service() {
    echo "--> Setting up systemd user service..."

    # Find node path
    NODE_PATH=$(which node)
    if [ -z "$NODE_PATH" ]; then
        echo "Error: Could not find 'node' executable in PATH."
        echo "Please ensure Node.js is installed and accessible."
        exit 1
    fi
    echo "--> Found node at: $NODE_PATH"

    # Get absolute path to the server.js file
    SERVER_JS_PATH="$PROJECT_DIR/server.js"
    if [ ! -f "$SERVER_JS_PATH" ]; then
        echo "Error: Server file not found at '$SERVER_JS_PATH'"
        exit 1
    fi

    # Create systemd user directory if it doesn't exist
    mkdir -p "$SYSTEMD_USER_DIR"
    echo "--> Ensured systemd user directory exists: $SYSTEMD_USER_DIR"

    # Create the service file content
    echo "--> Creating service file content for '$SERVICE_FILE_PATH'..."
    cat << EOF > "$SERVICE_FILE_PATH"
[Unit]
Description=Kto Poblizhe Game Server (Managed by cwoserctl.sh)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE_PATH $SERVER_JS_PATH
Restart=on-failure
RestartSec=5s
Environment="NODE_ENV=production"
# If you use a .env file and want systemd to load it:
# EnvironmentFile=$PROJECT_DIR/.env

[Install]
WantedBy=default.target
EOF

    # Check if file was created
    if [ ! -f "$SERVICE_FILE_PATH" ]; then
        echo "Error: Failed to create service file at '$SERVICE_FILE_PATH'"
        exit 1
    fi

    echo "--> Service file created successfully."
    echo "--> Reloading systemd user daemon..."
    systemctl --user daemon-reload

    echo ""
    echo "========================= SUCCESS ========================="
    echo "Systemd service '$SERVICE_NAME' created."
    echo "To enable it to start on login, run:"
    echo "  systemctl --user enable $SERVICE_NAME"
    echo "To start it now, run:"
    echo "  systemctl --user start $SERVICE_NAME"
    echo "To check its status, run:"
    echo "  systemctl --user status $SERVICE_NAME"
    echo "==========================================================="
}


# Main script logic
case "$1" in
  update | deploy | restart)
    echo "Executing 'game update' (pull git, npm install, restart service)..."
    update_and_restart
    ;;

  logs)
    echo "Executing 'game logs'..."
    show_logs
    ;;

  stop)
    echo "Executing 'game stop'..."
    stop_service
    ;;

  start)
    echo "Executing 'game start' (start service if stopped)..."
    start_service
    ;;

  status)
    echo "--> Status for '$SERVICE_NAME':"
    systemctl --user status "$SERVICE_NAME"
    ;;

  setup-service)
    echo "Executing 'game setup-service'..."
    setup_service
    ;;

  *)
    # Adjusted name here
    echo "Usage: $0 {update|deploy|restart|start|stop|status|logs|setup-service}"
    echo "  update/deploy/restart - Pull git changes, install deps, and restart the systemd service."
    echo "  start               - Start the systemd service if not running."
    echo "  stop                - Stop the systemd service."
    echo "  status              - Show the current status of the systemd service."
    echo "  logs                - Show and follow the logs from the systemd service."
    echo "  setup-service       - Create the systemd user service file."
    exit 1
    ;;
esac

exit 0