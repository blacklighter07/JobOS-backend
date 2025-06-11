const Redis = require('ioredis');

// const redisClient = new Redis({
//   host: process.env.REDIS_HOST || '127.0.0.1', // Redis host
//   port: process.env.REDIS_PORT || 6379,       // Redis port
//   password: process.env.REDIS_PASSWORD || '', // Optional: Redis password
//   db: process.env.REDIS_DB || 0,              // Redis database index
//   tls: process.env.REDIS_TLS ? {} : undefined // Optional: TLS for secure connections
// });

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

const redis = new Redis(redisUrl);

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

module.exports = redis;
