// lib/github.js
import fetch from 'node-fetch';

export const getRawUrl = (owner, repo, branch, filePath) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
