import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Helper to parse boolean values from environment variables
 */
const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
};

/**
 * Helper to strip quotes from string values
 */
const stripQuotes = (value: string | undefined, defaultValue: string = ''): string => {
  if (!value) return defaultValue;
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

// Type definitions for configuration
export interface ServerConfig {
  port: number;
  nodeEnv: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
}

export interface JwtConfig {
  secret: string;
}

export interface OpenAIConfig {
  useOpenAI: boolean;
  apiKey: string;
  useTools: boolean;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface ClaudeConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface LLMConfig {
  defaultProvider: 'openai' | 'claude' | 'gemini';
}

export interface Config {
  server: ServerConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  openai: OpenAIConfig;
  claude: ClaudeConfig;
  gemini: GeminiConfig;
  llm: LLMConfig;
}

/**
 * Application configuration loaded from environment variables
 * Based on env.example file
 */
export const config: Config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Database Configuration (PostgreSQL)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'chatbot_sb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'your_password',
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your_jwt_secret_here',
  },

  // OpenAI Configuration
  openai: {
    useOpenAI: parseBoolean(process.env.USE_OPENAI, true),
    apiKey: process.env.OPENAI_API_KEY || '',
    useTools: parseBoolean(process.env.USE_TOOLS, true),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1024', 10),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
  },

  // Claude (Anthropic) Configuration
  claude: {
    apiKey: process.env.CLAUDE_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '1024', 10),
    temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.7'),
  },

  // Gemini (Google) Configuration
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '1024', 10),
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.7'),
  },

  // LLM Provider Selection
  llm: {
    defaultProvider: (process.env.DEFAULT_LLM_PROVIDER || 'openai') as 'openai' | 'claude' | 'gemini',
  },
};