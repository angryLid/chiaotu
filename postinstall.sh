#!/bin/bash

set -e

echo "Setting up chiaotu configuration..."

# Create the target configuration directory
CONFIG_DIR="$HOME/.config/chiaotu"
echo "Creating configuration directory: $CONFIG_DIR"

# Create the directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Copy the resources directory to the config directory
echo "Copying resources to $CONFIG_DIR..."
cp -r resources/* "$CONFIG_DIR/"

# Ensure proper permissions
chmod -R 755 "$CONFIG_DIR"

echo "Setup completed successfully!"
echo "Resources have been copied to: $CONFIG_DIR"