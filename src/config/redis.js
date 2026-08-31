import Redis from 'ioredis';

//redis instance 
const redis = new Redis({ host: 'localhost', port: 6379 });

export default redis;