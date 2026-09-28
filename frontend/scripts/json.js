const fs = require('fs');
const path = require('path');

const SCAN_DIRS = ['components', 'app', 'lib'];
const LOCALES_DIR = path.resolve(__dirname, '..', 'public', 'locales');
const LANGUAGES = ['fr', 'ar'];

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------
function stripComments(code) {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function isValidTranslationKey(dottedKey) {
  const segments = dottedKey.split('.');
  return segments.every(seg => /^[a-zA-Z]\w*$/.test(seg));
}

// ----------------------------------------------------------------------
// 1) Extract keys per file – enhanced logic
// ----------------------------------------------------------------------
function extractKeysFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const content = stripComments(raw);

  // Detect all namespaces used in this file
  const nsMatches = content.matchAll(/useTranslations\(['"]([^'"]+)['"]\)/g);
  const namespaces = new Set();
  for (const m of nsMatches) namespaces.add(m[1]);
  if (namespaces.size === 0) return { file: filePath, keys: [] }; // skip if no translations hook

  const directKeys = new Set();
  const labelKeys = new Set();

  // --- Direct t('key') or t.rich('key') calls ---
  const KEY_REGEX = /t(?:\.rich)?\(\s*(['"])([^'"]*?)\1\s*[,\)]/g;
  let match;
  while ((match = KEY_REGEX.exec(content)) !== null) {
    const key = match[2];
    if (key) directKeys.add(key);
  }

  // --- Object properties likely to be translation keys (labelKey, key) ---
  // Matches: labelKey: 'some.key'   or   key: 'some.key'
  const LABEL_REGEX = /\b(?:labelKey|key)\s*:\s*(['"])([^'"]+)\1/g;
  while ((match = LABEL_REGEX.exec(content)) !== null) {
    const key = match[2];
    if (key) labelKeys.add(key);
  }

  // Combine both types
  const allKeys = new Set([...directKeys, ...labelKeys]);

  // For each detected namespace, create a set of dotted keys
  const result = [];
  for (const ns of namespaces) {
    const nsKeys = [];
    for (const k of allKeys) {
      // We assume these keys belong to the namespace where t() is used
      nsKeys.push(`${ns}.${k}`);
    }
    result.push(...nsKeys);
  }

  return { file: filePath, keys: result };
}

// ----------------------------------------------------------------------
// 2) Walk directories and collect all keys
// ----------------------------------------------------------------------
function collectAllKeys() {
  const fileKeys = [];
  function walk(dir) {
    const full = path.resolve(__dirname, '..', dir);
    if (!fs.existsSync(full)) return;
    fs.readdirSync(full, { withFileTypes: true }).forEach(entry => {
      const p = path.join(full, entry.name);
      if (entry.isDirectory()) walk(path.relative(path.resolve(__dirname, '..'), p));
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const result = extractKeysFromFile(p);
        if (result.keys.length > 0) fileKeys.push(result);
      }
    });
  }
  SCAN_DIRS.forEach(d => walk(d));
  return fileKeys;
}

// ----------------------------------------------------------------------
// 3) Flatten JSON
// ----------------------------------------------------------------------
function flattenJSON(obj, prefix = '') {
  const keys = new Set();
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      for (const sub of flattenJSON(obj[k], full)) keys.add(sub);
    } else {
      keys.add(full);
    }
  }
  return keys;
}

// ----------------------------------------------------------------------
// 4) Compare
// ----------------------------------------------------------------------
function compare(language) {
  const jsonPath = path.join(LOCALES_DIR, language, 'common.json');
  if (!fs.existsSync(jsonPath)) {
    console.log(`⚠️  No JSON file for "${language}"`);
    return;
  }
  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const jsonKeys = flattenJSON(json);

  const allFileKeys = collectAllKeys();
  const codeKeys = new Set();
  for (const { file, keys } of allFileKeys) {
    for (const k of keys) {
      if (isValidTranslationKey(k)) codeKeys.add(k);
    }
  }

  const missing = [...codeKeys].filter(k => !jsonKeys.has(k));
  const extra = [...jsonKeys].filter(k => !codeKeys.has(k));

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${language.toUpperCase()} Translation Check`);
  console.log(`${'='.repeat(50)}\n`);

  // Show per-file keys (optional but helpful)
  console.log('🔍 Keys found per file:');
  for (const { file, keys } of allFileKeys) {
    const valid = keys.filter(isValidTranslationKey);
    if (valid.length > 0) {
      console.log(`  ${path.relative(path.resolve(__dirname, '..'), file)}`);
      valid.forEach(k => console.log(`    - ${k}`));
    }
  }

  console.log(`\n---`);
  if (missing.length === 0) {
    console.log('✅ All code keys exist in the JSON file.');
  } else {
    console.log(`❌ Missing keys (${missing.length}):`);
    missing.sort().forEach(k => console.log(`   - ${k}`));
  }

  if (extra.length === 0) {
    console.log('✅ No unused keys in the JSON file.');
  } else {
    console.log(`🟡 Extra keys not found in code (${extra.length}):`);
    extra.sort().forEach(k => console.log(`   - ${k}`));
  }
}

// ----------------------------------------------------------------------
// 5) Run
// ----------------------------------------------------------------------
LANGUAGES.forEach(compare);