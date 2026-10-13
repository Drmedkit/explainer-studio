// Build + deploy a topic: page (out/page: the artifact's index.html and a local preview.html), static site (out/site), and
// with --deploy `npx wrangler deploy` (worker name from topic.config.json -> https://<worker>.<your-subdomain>.workers.dev;
// set WORKERS_SUBDOMAIN to have the URL printed).
//   node ship.mjs <topic>             build page + site (no deploy)
//   node ship.mjs <topic> --deploy    build, then deploy with wrangler (after `npx wrangler login`)
// Publish the page as a claude.ai Artifact separately (load the artifact-design skill; icon one generic word).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { loadTopic, topicArg, arg } from './lib/topic.mjs';
import { buildPage, buildSite } from './lib/page.mjs';

const T = loadTopic(topicArg());
buildPage(T);
buildSite(T);
if (!fs.existsSync(T.film720)) console.warn('note: no rendered film yet (node render.mjs <topic>)');
if (arg('deploy')) {
  console.log(`deploying ${T.cfg.worker} ...`);
  const r = spawnSync('npx', ['wrangler', 'deploy'], { cwd: T.dir, stdio: 'inherit', shell: true });
  if (r.status) { console.error('wrangler deploy failed'); process.exit(r.status); }
  console.log(process.env.WORKERS_SUBDOMAIN ? `live: https://${T.cfg.worker}.${process.env.WORKERS_SUBDOMAIN}.workers.dev` : 'live: see the URL wrangler printed above');
} else console.log(`built. Deploy with: node ship.mjs ${process.argv[2]} --deploy`);
