module.exports = {
  apps: [
    {
      name: 'efootball-league',
      script: 'server/index.js',
      instances: 1, // Single instance to prevent SQLite concurrency conflicts and duplicate Telegram bot polling
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
