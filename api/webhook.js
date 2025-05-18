import { supabase } from '../lib/supabase.js';
import matter from 'gray-matter';

const GITHUB_API = 'https://api.github.com';

async function listMdFiles(owner, repo, path = '') {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch contents: ' + res.status);
  }

  const files = await res.json();
  let mdFiles = [];

  for (const file of files) {
    if (file.type === 'file' && file.name.endsWith('.md')) {
      mdFiles.push(file.path);
    } else if (file.type === 'dir') {
      const nested = await listMdFiles(owner, repo, file.path);
      mdFiles = mdFiles.concat(nested);
    }
  }

  return mdFiles;
}

async function fetchRawContent(owner, repo, branch, filePath) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
  const res = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3.raw'
    }
  });

  if (!res.ok) {
    throw new Error('Failed to fetch raw content: ' + res.status);
  }

  return await res.text();
}

export default async function handler(req, res) {
  try {
    const owner = 'MonsterFlick';
    const repo = 'GitFool-Blogs';
    const branch = 'main';

    // Step 1: Get all markdown files from GitHub
    const mdFiles = await listMdFiles(owner, repo);

    // Build the current GitHub content URLs
    const currentGitHubUrls = mdFiles.map(filePath =>
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
    );

    // Step 2: Get all content_url entries from Supabase
    const { data: existingRecords, error: fetchError } = await supabase
      .from('blogs')
      .select('content_url');

    if (fetchError) {
      console.error('Failed to fetch existing blog entries:', fetchError);
      return res.status(500).send('Supabase fetch error');
    }

    const existingUrls = existingRecords.map(record => record.content_url);

    // Step 3: Delete missing files from Supabase
    const toDelete = existingUrls.filter(url => !currentGitHubUrls.includes(url));

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('blogs')
        .delete()
        .in('content_url', toDelete);

      if (deleteError) {
        console.error('Error deleting old records:', deleteError);
        return res.status(500).send('Supabase delete error');
      }

      console.log(`Deleted ${toDelete.length} stale blog records.`);
    }

    // Step 4: Insert/update current GitHub files
    for (const filePath of mdFiles) {
      const content_url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
      const rawContent = await fetchRawContent(owner, repo, branch, filePath);
      const { data: frontmatter } = matter(rawContent);

      const upsertData = {
        content_url,
        updated_at: new Date().toISOString(),
        title: frontmatter.title ?? null,
        description: frontmatter.description ?? null,
        date: frontmatter.date ?? null,
        tags: frontmatter.tags ?? [],
        image: frontmatter.image ?? null,
        author: frontmatter.author ?? null,
      };

      const { error: upsertError } = await supabase
        .from('blogs')
        .upsert(upsertData, {
          onConflict: ['content_url'],
          updateColumns: ['updated_at', 'title', 'description', 'date', 'tags', 'image', 'author'],
        });

      if (upsertError) {
        console.error(`Error upserting ${filePath}:`, upsertError);
        return res.status(500).send('Supabase upsert error');
      }
    }

    res.status(200).send(`Synced ${mdFiles.length} files. Deleted ${toDelete.length} removed entries.`);
  } catch (err) {
    console.error('Error during sync:', err);
    res.status(500).send('Server error');
  }
}
