import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');
const portableDir = path.join(rootDir, 'windows-portable');
const portableUiDir = path.join(portableDir, 'ui');
const githubSessionPath = path.join(rootDir, 'offline-depot', 'logs', 'github_session.json');
const githubSyncConfigPath = path.join(rootDir, '.github-sync.json');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function collectWorkspaceFilesForGithub(dirPath, baseDir = dirPath) {
  const results = [];
  const excludedDirs = new Set([
    'node_modules',
    '.git',
    '.playwright-cli',
    'dist',
    '.aistudio',
  ]);

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (excludedDirs.has(entry.name)) continue;
    if (entry.name === '.github-sync.json' || entry.name.startsWith('.env')) {
      if (entry.name !== '.env.example') continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (
      relPath.startsWith('offline-depot/splunk_bins/') ||
      relPath.startsWith('offline-depot/rpms/') ||
      relPath.startsWith('offline-depot/logs/') ||
      relPath.startsWith('public/assets/aistudio/')
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...collectWorkspaceFilesForGithub(fullPath, baseDir));
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      if (stat.size <= 8 * 1024 * 1024) {
        results.push({ relPath, fullPath });
      }
    }
  }
  return results;
}

function loadGithubSyncSession() {
  try {
    if (fs.existsSync(githubSyncConfigPath)) {
      const data = JSON.parse(fs.readFileSync(githubSyncConfigPath, 'utf-8'));
      if (data && data.accessToken) return data;
    }
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(githubSessionPath)) {
      const data = JSON.parse(fs.readFileSync(githubSessionPath, 'utf-8'));
      if (data && data.accessToken) return data;
    }
  } catch {
    // ignore
  }
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT;
  if (envToken) {
    return {
      accessToken: envToken,
      repoName: process.env.GITHUB_REPO || 'MAN7',
      branch: process.env.GITHUB_BRANCH || 'main',
      autoSync: true,
    };
  }
  return null;
}

function saveGithubSyncSession(session) {
  try {
    fs.mkdirSync(path.dirname(githubSessionPath), { recursive: true });
    fs.writeFileSync(githubSessionPath, JSON.stringify(session, null, '  '), 'utf-8');
    fs.writeFileSync(githubSyncConfigPath, JSON.stringify(session, null, '  '), 'utf-8');
  } catch {
    // ignore
  }
}

async function autoPushToGithubAfterBuild() {
  const session = loadGithubSyncSession();
  if (!session || !session.accessToken) {
    console.log('[MAN7 Auto-Sync] No GitHub token configured yet. Skipping automatic GitHub push.');
    return;
  }
  if (session.autoSync === false) {
    console.log('[MAN7 Auto-Sync] Auto-sync is paused by user setting.');
    return;
  }

  const token = session.accessToken;
  const repoName = (session.repoName || 'MAN7').trim() || 'MAN7';
  const branch = (session.branch || 'main').trim() || 'main';
  const isPrivate = Boolean(session.privateRepo);

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'MAN7-AirGap-AutoSync',
  };

  try {
    let owner = session.login;
    if (!owner) {
      const userResp = await fetch('https://api.github.com/user', { headers: ghHeaders });
      if (!userResp.ok) {
        console.warn('[MAN7 Auto-Sync] Could not resolve GitHub user with current token.');
        return;
      }
      const userData = await userResp.json();
      owner = userData.login;
      session.login = userData.login;
      session.name = userData.name || userData.login;
      session.avatarUrl = userData.avatar_url || '';
      session.htmlUrl = userData.html_url || `https://github.com/${userData.login}`;
    }

    console.log(`[MAN7 Auto-Sync] Auto-pushing build & source to https://github.com/${owner}/${repoName} (${branch}) ...`);

    // 1. Ensure repository exists
    const checkResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: ghHeaders,
    });
    if (checkResp.status === 404) {
      const createResp = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          name: repoName,
          description: 'MAN7 - Air-Gapped Splunk Enterprise & RHEL Hardening Platform (Windows & Linux Portable)',
          private: isPrivate,
          auto_init: true,
        }),
      });
      if (!createResp.ok) {
        console.warn('[MAN7 Auto-Sync] Failed to auto-create repository on GitHub.');
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    // 2. Get latest commit SHA on branch
    let latestCommitSha = null;
    const refResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/${branch}`, {
      headers: ghHeaders,
    });
    if (refResp.ok) {
      const refData = await refResp.json();
      latestCommitSha = refData.object?.sha || null;
    }

    // 3. Upload blobs
    const files = collectWorkspaceFilesForGithub(rootDir);
    const treeItems = [];
    for (const file of files) {
      const contentB64 = fs.readFileSync(file.fullPath).toString('base64');
      const blobResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/blobs`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          content: contentB64,
          encoding: 'base64',
        }),
      });
      if (!blobResp.ok) {
        throw new Error(`Failed uploading blob for ${file.relPath}`);
      }
      const blobData = await blobResp.json();
      const isExec = file.relPath.endsWith('.sh') || file.relPath.endsWith('.bat');
      treeItems.push({
        path: file.relPath,
        mode: isExec ? '100755' : '100644',
        type: 'blob',
        sha: blobData.sha,
      });
    }

    // 4. Create tree (with automatic fallback if PAT lacks 'workflow' scope for .github/workflows/*)
    let activeTreeItems = treeItems;
    let treeResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ tree: activeTreeItems }),
    });
    if (!treeResp.ok) {
      activeTreeItems = treeItems.map((item) =>
        item.path.startsWith('.github/workflows/')
          ? { ...item, path: item.path.replace(/^\.github\/workflows\//, '.devcontainer/workflows/') }
          : item
      );
      treeResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({ tree: activeTreeItems }),
      });
    }
    if (!treeResp.ok) {
      throw new Error('Failed creating Git tree');
    }
    const treeData = await treeResp.json();

    // 5. Create commit
    const timestamp = new Date().toISOString();
    const commitPayload = {
      message: `chore(auto-sync): automatic MAN7 build & portable update (${timestamp}) [skip ci]`,
      tree: treeData.sha,
    };
    if (latestCommitSha) {
      commitPayload.parents = [latestCommitSha];
    }

    const commitResp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/commits`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify(commitPayload),
    });
    if (!commitResp.ok) {
      throw new Error('Failed creating Git commit');
    }
    const commitData = await commitResp.json();

    // 6. Update branch ref
    if (latestCommitSha) {
      await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        headers: ghHeaders,
        body: JSON.stringify({ sha: commitData.sha, force: true }),
      });
    } else {
      await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitData.sha }),
      });
    }

    const repoUrl = `https://github.com/${owner}/${repoName}`;
    saveGithubSyncSession({
      ...session,
      repoName,
      branch,
      autoSync: true,
      lastRepoUrl: repoUrl,
      lastCommitSha: commitData.sha,
      lastPushAt: timestamp,
    });
    console.log(`[MAN7 Auto-Sync] Successfully updated GitHub repo ${repoUrl} @ ${commitData.sha.slice(0, 8)} (${treeItems.length} files)`);
  } catch (err) {
    console.warn('[MAN7 Auto-Sync Warning]', err.message || err);
  }
}

async function run() {
  console.log('[MAN7 Build] Syncing dist/ to windows-portable/ui/ ...');
  if (!fs.existsSync(distDir)) {
    throw new Error('dist/ directory not found. Run vite build first.');
  }

  fs.mkdirSync(portableUiDir, { recursive: true });
  copyRecursiveSync(distDir, portableUiDir);

  // Build standalone single-file HTML (works both via http://127.0.0.1:3000 and direct file:// double-click on Windows)
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    let html = fs.readFileSync(indexHtmlPath, 'utf-8');
    const assetsDir = path.join(distDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      const assetFiles = fs.readdirSync(assetsDir);
      const cssFiles = assetFiles.filter((f) => f.endsWith('.css'));
      const jsFiles = assetFiles.filter((f) => f.endsWith('.js'));

      let inlineStyles = '';
      for (const cssFile of cssFiles) {
        const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf-8');
        inlineStyles += `<style>\n${cssContent}\n</style>\n`;
      }

      let inlineScripts = '';
      for (const jsFile of jsFiles) {
        const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8');
        // Escape closing script tags inside JS bundle if any
        const safeJs = jsContent.replace(/<\/script>/gi, '<\\/script>');
        inlineScripts += `<script type="module">\n${safeJs}\n</script>\n`;
      }

      // Remove external asset script/link tags and inject inline bundles safely using function replacers
      html = html.replace(/<link[^>]+href="[^"]*assets\/[^"]+\.css"[^>]*>/gi, '');
      html = html.replace(/<script[^>]+src="[^"]*assets\/[^"]+\.js"[^>]*><\/script>/gi, '');
      html = html.replace('</head>', () => `${inlineStyles}</head>`);
      html = html.replace('</body>', () => `${inlineScripts}</body>`);

      const standaloneRootPath = path.join(rootDir, 'MAN7-Standalone.html');
      const standalonePortablePath = path.join(portableDir, 'MAN7-Standalone.html');
      fs.writeFileSync(standaloneRootPath, html, 'utf-8');
      fs.writeFileSync(standalonePortablePath, html, 'utf-8');
      // Also write inline-ready index.html into windows-portable/ui/index.html so both HTTP and file:// work seamlessly
      fs.writeFileSync(path.join(portableUiDir, 'index.html'), html, 'utf-8');
      console.log('[MAN7 Build] Created self-contained MAN7-Standalone.html & windows-portable/ui/index.html');
    }
  }

  console.log('[MAN7 Build] Bundling server.ts -> man7-server.cjs ...');
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    external: ['vite'],
    outfile: path.join(distDir, 'man7-server.cjs'),
  });

  fs.copyFileSync(
    path.join(distDir, 'man7-server.cjs'),
    path.join(portableDir, 'man7-server.cjs')
  );
  console.log('[MAN7 Build] Portable build complete!');

  // Automatically push to GitHub after every build if connected
  await autoPushToGithubAfterBuild();
}

run().catch((err) => {
  console.error('[MAN7 Build Error]', err);
  process.exit(1);
});
