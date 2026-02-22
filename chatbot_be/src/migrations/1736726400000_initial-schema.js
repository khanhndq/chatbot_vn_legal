/**
 * Initial database schema migration
 * Creates chat_sessions and messages tables with indexes
 * Based on DatabaseService.initializeDatabase() function
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Create tables and indexes
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Create chat_sessions table
  pgm.createTable('chat_sessions', {
    id: {
      type: 'varchar(255)',
      primaryKey: true,
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    last_activity: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create messages table
  pgm.createTable('messages', {
    id: {
      type: 'varchar(255)',
      primaryKey: true,
      notNull: true,
    },
    session_id: {
      type: 'varchar(255)',
      notNull: true,
      references: 'chat_sessions(id)',
      onDelete: 'CASCADE',
    },
    user_message: {
      type: 'text',
      notNull: true,
    },
    bot_response: {
      type: 'text',
      notNull: true,
    },
    timestamp: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create indexes for better performance
  pgm.createIndex('messages', 'session_id', {
    name: 'idx_messages_session_id',
  });
  
  pgm.createIndex('messages', 'timestamp', {
    name: 'idx_messages_timestamp',
  });
  
  pgm.createIndex('chat_sessions', 'last_activity', {
    name: 'idx_sessions_last_activity',
  });
};

/**
 * Drop tables and indexes (rollback)
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop indexes first
  pgm.dropIndex('chat_sessions', 'last_activity', {
    name: 'idx_sessions_last_activity',
    ifExists: true,
  });
  
  pgm.dropIndex('messages', 'timestamp', {
    name: 'idx_messages_timestamp',
    ifExists: true,
  });
  
  pgm.dropIndex('messages', 'session_id', {
    name: 'idx_messages_session_id',
    ifExists: true,
  });

  // Drop tables (messages first due to foreign key)
  pgm.dropTable('messages', { ifExists: true, cascade: true });
  pgm.dropTable('chat_sessions', { ifExists: true, cascade: true });
};

