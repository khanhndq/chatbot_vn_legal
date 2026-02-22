# Database Migrations 📦

This directory contains database migration files managed by **node-pg-migrate**.

## Configuration ⚙️

Migration configuration is defined in `.migrationrc.js` at the project root. It automatically reads database credentials from your `.env` file.

### Environment Variables

Ensure these variables are set in your `.env` file:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chatbot_sb
DB_USER=postgres
DB_PASSWORD=your_password

# Optional: Use full connection string instead
# DATABASE_URL=postgresql://postgres:your_password@localhost:5432/chatbot_sb
```

## Available Commands 🚀

### Run Migrations (Up)
```bash
npm run migrate
```
Applies all pending migrations to the database.

### Rollback Migrations (Down)
```bash
npm run migrate:down
```
Reverts the last migration.

### Check Migration Status
```bash
npm run migrate:status
```
Shows which migrations have been applied.

### Create New Migration
```bash
npm run migrate:create <migration-name>
```
Creates a new migration file with a timestamp prefix.

Example:
```bash
npm run migrate:create add-user-table
```

### Redo Last Migration
```bash
npm run migrate:redo
```
Rolls back and re-applies the last migration (useful for testing).

## Migration File Structure 📄

Each migration file contains two functions:

- **`up(pgm)`**: Applies the migration (creates tables, adds columns, etc.)
- **`down(pgm)`**: Reverts the migration (drops tables, removes columns, etc.)

### Example Migration

```javascript
export const up = (pgm) => {
  pgm.createTable('my_table', {
    id: 'id',
    name: { type: 'varchar(255)', notNull: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });
};

export const down = (pgm) => {
  pgm.dropTable('my_table', { ifExists: true });
};
```

## Best Practices ✨

1. **Always write a `down` migration** for rollback capability
2. **Test migrations locally** before deploying to production
3. **Use transactions** for complex migrations (node-pg-migrate does this by default)
4. **Never edit applied migrations** - create new migrations instead
5. **Keep migrations small and focused** - one logical change per migration
6. **Use descriptive names** for migration files

## Initial Schema 📋

The initial migration (`1736726400000_initial-schema.js`) creates:

- **guru_chat_sessions** table
  - `id` (VARCHAR, PK)
  - `created_at` (TIMESTAMP)
  - `last_activity` (TIMESTAMP)

- **guru_messages** table
  - `id` (VARCHAR, PK)
  - `session_id` (VARCHAR, FK → guru_chat_sessions)
  - `user_message` (TEXT)
  - `bot_response` (TEXT)
  - `timestamp` (TIMESTAMP)
  - `created_at` (TIMESTAMP)

- **Indexes**
  - `idx_guru_messages_session_id`
  - `idx_guru_messages_timestamp`
  - `idx_guru_sessions_last_activity`

## Troubleshooting 🔧

### Connection Issues
If you get connection errors, verify:
- PostgreSQL is running
- Database exists
- Credentials in `.env` are correct

### Migration Already Applied
If a migration shows as already applied but you want to re-run it:
```bash
npm run migrate:down
npm run migrate
```

### Reset All Migrations (Development Only!)
⚠️ **WARNING**: This will delete all data!
```bash
# Drop all tables manually or:
npm run migrate:down -- 0
npm run migrate
```

## Documentation 📚

For more information on node-pg-migrate, visit:
https://github.com/salsita/node-pg-migrate

