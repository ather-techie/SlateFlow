#!/usr/bin/env node
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dryRun = process.argv.includes('--dry-run');

// Get database path from .env or use default
const envPath = path.join(__dirname, '../../..', '.env');
let dbPath = 'server/slateflow.db';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^DATABASE_PATH=(.+)$/m);
  if (match) {
    dbPath = match[1];
  }
}

const schemaPath = path.join(__dirname, '../../..', 'server/src/db/schema.sql');

if (!fs.existsSync(schemaPath)) {
  console.error('❌ schema.sql not found at', schemaPath);
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, 'utf-8');

// Simple password hasher (matches server/src/lib/auth.ts pattern)
function hashPassword(password) {
  // This is a placeholder; in production SlateFlow uses bcrypt
  // For seeding, we use a simple hash for dev purposes
  return crypto.createHash('sha256').update(password).digest('hex');
}

const db = new Database(dbPath);

try {
  // Create tables from schema
  const statements = schema.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      if (dryRun) {
        console.log(stmt + ';');
      } else {
        db.exec(stmt);
      }
    }
  }

  if (dryRun) {
    console.log('\n-- Seed data:');
  }

  const now = new Date().toISOString();

  // Create users
  const adminId = 1;
  const devId = 2;

  const adminInsert = `
    INSERT INTO users (id, email, display_name, role, password_hash, created_at, updated_at)
    VALUES (${adminId}, 'admin@flow.local', 'Admin', 'super_admin', '${hashPassword('Admin1234!')}', '${now}', '${now}');
  `;
  const devInsert = `
    INSERT INTO users (id, email, display_name, role, password_hash, created_at, updated_at)
    VALUES (${devId}, 'dev@flow.local', 'Developer', 'global_reader', '${hashPassword('Dev1234!')}', '${now}', '${now}');
  `;

  if (dryRun) {
    console.log(adminInsert);
    console.log(devInsert);
  } else {
    db.exec(adminInsert);
    db.exec(devInsert);
  }

  // Create default project
  const projectId = 1;
  const projectInsert = `
    INSERT INTO projects (id, name, description, color, is_default, created_by, created_at, updated_at)
    VALUES (${projectId}, 'Default Project', 'Sample project with demo data', '#3b82f6', 1, ${adminId}, '${now}', '${now}');
  `;

  if (dryRun) {
    console.log(projectInsert);
  } else {
    db.exec(projectInsert);
  }

  // Create default sprint
  const sprintId = 1;
  const sprintInsert = `
    INSERT INTO sprints (id, project_id, name, is_default, start_date, end_date, created_at, updated_at)
    VALUES (${sprintId}, ${projectId}, 'Default Sprint', 1, '2026-05-24', '2026-06-07', '${now}', '${now}');
  `;

  if (dryRun) {
    console.log(sprintInsert);
  } else {
    db.exec(sprintInsert);
  }

  // Create additional sprint (active)
  const sprint2Id = 2;
  const sprint2Insert = `
    INSERT INTO sprints (id, project_id, name, is_default, start_date, end_date, created_at, updated_at)
    VALUES (${sprint2Id}, ${projectId}, 'Sprint 1', 0, '2026-05-10', '2026-05-24', '${now}', '${now}');
  `;

  if (dryRun) {
    console.log(sprint2Insert);
  } else {
    db.exec(sprint2Insert);
  }

  // Create default epic
  const epicId = 1;
  const epicInsert = `
    INSERT INTO epics (id, project_id, name, description, is_default, created_by, created_at, updated_at)
    VALUES (${epicId}, ${projectId}, 'Default Epic', 'Auto-contributor access for all users', 1, ${adminId}, '${now}', '${now}');
  `;

  if (dryRun) {
    console.log(epicInsert);
  } else {
    db.exec(epicInsert);
  }

  // Create custom epic
  const epic2Id = 2;
  const epic2Insert = `
    INSERT INTO epics (id, project_id, name, description, is_default, created_by, created_at, updated_at)
    VALUES (${epic2Id}, ${projectId}, 'Platform Features', 'Core platform improvements and enhancements', 0, ${adminId}, '${now}', '${now}');
  `;

  if (dryRun) {
    console.log(epic2Insert);
  } else {
    db.exec(epic2Insert);
  }

  // Create default feature
  const featureId = 1;
  const featureInsert = `
    INSERT INTO features (id, epic_id, name, description, created_at, updated_at)
    VALUES (${featureId}, ${epicId}, 'Default Feature', 'Placeholder feature', '${now}', '${now}');
  `;

  if (dryRun) {
    console.log(featureInsert);
  } else {
    db.exec(featureInsert);
  }

  // Create custom features
  const feature2Id = 2;
  const feature2Insert = `
    INSERT INTO features (id, epic_id, name, description, created_at, updated_at)
    VALUES (${feature2Id}, ${epic2Id}, 'Real-time Collaboration', 'Enable multi-user simultaneous editing', '${now}', '${now}');
  `;

  if (dryRun) {
    console.log(feature2Insert);
  } else {
    db.exec(feature2Insert);
  }

  // Create swim lanes
  const laneInserts = [
    `INSERT INTO swim_lanes (id, project_id, name, position, is_done_col, created_at, updated_at) VALUES (1, ${projectId}, 'To Do', 1, 0, '${now}', '${now}');`,
    `INSERT INTO swim_lanes (id, project_id, name, position, is_done_col, created_at, updated_at) VALUES (2, ${projectId}, 'In Progress', 2, 0, '${now}', '${now}');`,
    `INSERT INTO swim_lanes (id, project_id, name, position, is_done_col, created_at, updated_at) VALUES (3, ${projectId}, 'Review', 3, 0, '${now}', '${now}');`,
    `INSERT INTO swim_lanes (id, project_id, name, position, is_done_col, created_at, updated_at) VALUES (4, ${projectId}, 'Done', 4, 1, '${now}', '${now}');`,
  ];

  if (dryRun) {
    laneInserts.forEach(insert => console.log(insert));
  } else {
    laneInserts.forEach(insert => db.exec(insert));
  }

  // Create cards
  const cardTitles = [
    'Implement user authentication',
    'Design dashboard layout',
    'Create card drag-and-drop',
    'Add sprint planning UI',
    'Build reporting module',
    'Setup database schema',
    'Add team collaboration features',
    'Create API documentation',
    'Implement real-time sync',
    'Add dark mode theme',
    'Create mobile-friendly layout',
    'Build export to CSV',
    'Add email notifications',
    'Create admin panel',
    'Implement role-based access',
  ];

  const laneIds = [1, 2, 3, 4];
  const cardInserts = [];

  for (let i = 0; i < cardTitles.length; i++) {
    const cardId = i + 1;
    const laneId = laneIds[i % laneIds.length];
    const assignedTo = i % 2 === 0 ? adminId : devId;
    const cardInsert = `
      INSERT INTO cards (id, sprint_id, swim_lane_id, title, description, assigned_to, position, created_at, updated_at)
      VALUES (${cardId}, ${sprintId}, ${laneId}, '${cardTitles[i]}', 'Card ${cardId} description', ${assignedTo}, ${i + 1}, '${now}', '${now}');
    `;
    cardInserts.push(cardInsert);
  }

  if (dryRun) {
    cardInserts.forEach(insert => console.log(insert));
  } else {
    cardInserts.forEach(insert => db.exec(insert));
  }

  if (!dryRun) {
    console.log('✓ Database created at', dbPath);
    console.log('✓ Schema initialized');
    console.log('✓ Default project, sprint, epic, feature inserted');
    console.log('✓ 1 additional sprint created');
    console.log('✓ ' + cardTitles.length + ' cards created');
    console.log('✓ 2 users created');
    console.log('\nDatabase seeded successfully!');
    console.log('\nLogin credentials:');
    console.log('  Admin: admin@flow.local / Admin1234!');
    console.log('  Dev:   dev@flow.local / Dev1234!');
  }
} catch (err) {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
} finally {
  if (!dryRun) {
    db.close();
  }
}
