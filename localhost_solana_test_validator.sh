#!/bin/bash

set -e # Exit on the first error

# Function to clean up processes on exit
cleanup() {
  echo "Shutting down local Solana validator..."
  if kill -0 $VALIDATOR_PID 2>/dev/null; then
    kill $VALIDATOR_PID
  fi
  if kill -0 $LOGS_PID 2>/dev/null; then
    kill $LOGS_PID
  fi
}

# Trap script exit to clean up resources
trap cleanup EXIT

# Step 1: Build the Anchor project
echo "Building the Anchor project..."
anchor build

# Step 2: Configure Solana CLI for the local network
echo "Configuring Solana CLI to use the local validator..."
solana config set --url http://127.0.0.1:8899

# Step 3: Start Local Validator with Cloned Accounts in Background
echo "Starting local validator with cloned mainnet accounts..."
solana-test-validator \
  --reset \
  --url https://api.mainnet-beta.solana.com \
  --clone CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C \
  --clone DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8 \
  --clone D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2 \
  --clone metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
  > validator.log 2>&1 &

# Store the PID of the background process
VALIDATOR_PID=$!

# Give the validator some time to start
sleep 5

# Step 4: Capture Solana logs in a separate background process
echo "Capturing Solana logs..."
solana logs > transaction.log 2>&1 &

# Store the PID of the logging process
LOGS_PID=$!

# Step 5: Deploy Anchor program to the local validator
echo "Deploying the Anchor program..."
anchor deploy

# Keep the script running as long as the validator is running
echo "The local validator is running. Press Ctrl+C to stop..."
while true; do
  if ! kill -0 $VALIDATOR_PID 2>/dev/null; then
    echo "Validator process has exited unexpectedly. Check $VALIDATOR_LOGFILE for more information."
    exit 1
  fi
  sleep 2
done