import { supabase } from '../lib/supabase.js';
import matter from 'gray-matter';

const GITHUB_API = 'https://api.github.com';

async function listMdFiles(owner, repo, path = '') {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;
  console.log(`Fetching file list from: ${url}`);
  const res = await fetch(url, {
    headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
  });
  if (!res.ok) {
    console.error(`Failed to fetch contents at path "${path}", status: ${res.status}`);
    throw new Error('Failed to fetch contents: ' + res.status);
  }
  const files = await res.json();

  let mdFiles = [];

  for (const file of files) {
    if (file.type === 'file' && file.name.endsWith('.md')) {
      console.log(`Found markdown file: ${file.path}`);
      mdFiles.push(file.path);
    } else if (file.type === 'dir') {
      console.log(`Entering directory: ${file.path}`);
      const nestedFiles = await listMdFiles(owner, repo, file.path);
      mdFiles = mdFiles.concat(nestedFiles);
    }
  }

  return mdFiles;
}

async function fetchRawContent(owner, repo, branch, filePath) {
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  console.log(`Fetching raw content from: ${rawUrl}`);
  const res = await fetch(rawUrl);
  if (!res.ok) {
    console.error(`Failed to fetch raw content for ${filePath}, status: ${res.status}`);
    throw new Error('Failed to fetch raw content: ' + res.status);
  }
  return await res.text();
}

export default async function handler(req, res) {
  try {
    const owner = 'MonsterFlick';
    const repo = 'GitFool-Blogs';
    const branch = 'main';

    console.log('Starting sync of markdown files...');
    const mdFiles = await listMdFiles(owner, repo);
    console.log(`Total markdown files found: ${mdFiles.length}`);

    for (const filePath of mdFiles) {
      console.log(`Processing file: ${filePath}`);

      const content_url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
      const rawContent = await fetchRawContent(owner, repo, branch, filePath);

      // Parse frontmatter using gray-matter
      const { data: frontmatter } = matter(rawContent);
      console.log(`Parsed frontmatter for ${filePath}:`, frontmatter);

      const upsertData = {
        content_url,
        updated_at: new Date().toISOString(),
        title: frontmatter.title ?? null,
        description: frontmatter.description ?? null,
        date: frontmatter.date ?? null,
        tags: frontmatter.tags ?? [],
        image: frontmatter.image ?? null,
        author: frontmatter.author ? JSON.stringify(frontmatter.author) : null,
      };
      
      const { error } = await supabase
        .from('blogs')
        .upsert(upsertData, { 
          onConflict: ['content_url'],
          updateColumns: ['updated_at', 'title', 'description', 'date', 'tags', 'image', 'author'],
        });


      if (error) {
        console.error(`Supabase upsert error on file ${filePath}:`, error);
        return res.status(500).send('Database error');
      } else {
        console.log(`Upsert successful for file: ${filePath}`);
      }
    }

    console.log('Sync complete.');
    res.status(200).send(`Synced ${mdFiles.length} markdown files with metadata.`);
  } catch (error) {
    console.error('Error in handler:', error);
    res.status(500).send('Server error');
  }
}
