/**
 * PM2 process definition for Odibrick.
 *
 * Both processes bind to the loopback interface only; Nginx is the single
 * public listener. Deploy with:
 *
 *   pm2 start deploy/ecosystem.config.js --env production
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'odibrick-api',
      cwd: '/var/www/odibrick/apps/api',
      script: 'dist/main.js',
      instances: 2,                 // raise to 'max' once the box has the cores
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      error_file: '/var/log/odibrick/api.error.log',
      out_file: '/var/log/odibrick/api.out.log',
      merge_logs: true,
      time: true,
      // Give in-flight requests a chance to finish on reload.
      kill_timeout: 8000,
      listen_timeout: 10000,
      wait_ready: false,
    },
    {
      name: 'odibrick-web',
      cwd: '/var/www/odibrick/apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '768M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/odibrick/web.error.log',
      out_file: '/var/log/odibrick/web.out.log',
      merge_logs: true,
      time: true,
      kill_timeout: 8000,
    },
  ],
};
