#!/bin/bash

# Simulate what BoardPage does on load
echo "=== Testing Card Loading Flow ==="

# Login
echo "1. Login..."
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"admin@flow.local","password":"Admin1234!"}' > /dev/null

# Get projects
echo "2. Fetch projects..."
PROJECT_ID=$(curl -s http://localhost:3000/api/projects -b cookies.txt | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "   Found project: $PROJECT_ID"

# Get lanes
echo "3. Fetch lanes for project..."
LANES=$(curl -s http://localhost:3000/api/projects/$PROJECT_ID/lanes -b cookies.txt)
LANE_IDS=$(echo "$LANES" | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "   Found lanes: $LANE_IDS"

# Get cards for each lane
echo "4. Fetch cards for each lane..."
for LANE_ID in $LANE_IDS; do
  CARDS=$(curl -s http://localhost:3000/api/lanes/$LANE_ID/cards -b cookies.txt)
  COUNT=$(echo "$CARDS" | grep -o '"id":' | wc -l)
  # Verify response is an array, not an object with "items" field
  if echo "$CARDS" | grep -q '"data":\['; then
    echo "   ✓ Lane $LANE_ID: $COUNT cards (correct array format)"
  elif echo "$CARDS" | grep -q '"items":'; then
    echo "   ✗ Lane $LANE_ID: BROKEN (paginated object format)"
  else
    echo "   ? Lane $LANE_ID: Unknown format"
  fi
done

echo ""
echo "=== Test Complete ==="
rm cookies.txt
