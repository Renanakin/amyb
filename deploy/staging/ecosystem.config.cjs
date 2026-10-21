module.exports = {
  apps: [{
    name: 'stg-amyb-api',
    cwd: '/var/www/staging/amyb/current/backend',
    script: 'dist/index.js',
    interpreter: '/usr/bin/node',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 3000,
    time: true,
    output: '/var/www/staging/amyb/shared/logs/api-out.log',
    error: '/var/www/staging/amyb/shared/logs/api-error.log',
    // Los secretos se leen desde backend/.env, enlazado a shared/config.
    env: {NODE_ENV: 'staging', HOST: '127.0.0.1', PORT: '4202'}
  }]
};
