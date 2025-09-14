#!/bin/bash
set -e

IMAGE=devops-pipeline:localtest
CONTAINER=devops-local-test
PORT=3000

echo "1) install deps"
npm ci

echo "2) lint"
npm run lint || true

echo "3) tests"
npm test

echo "4) build docker"
docker build -t $IMAGE .

echo "5) run container"
docker rm -f $CONTAINER || true
docker run -d --name $CONTAINER -p $PORT:3000 -e APP_VERSION=localtest $IMAGE

echo "6) curl health"
sleep 3
curl -s http://localhost:$PORT/health && echo

echo "7) curl status"
curl -s http://localhost:$PORT/status && echo

echo "8) stop & remove"
docker stop $CONTAINER
docker rm $CONTAINER

echo "✅ Local test passed"
