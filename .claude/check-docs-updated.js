const fs = require('fs');

let raw = '';
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const transcriptPath = input.transcript_path;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

    const lines = fs.readFileSync(transcriptPath, 'utf8')
      .split('\n').filter(Boolean);

    const filesWritten = new Set();
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const content = Array.isArray(entry.content) ? entry.content : [];
        for (const block of content) {
          if (block.type === 'tool_use' &&
              (block.name === 'Edit' || block.name === 'Write')) {
            const fp = block.input?.file_path;
            if (fp) filesWritten.add(fp.replace(/\\/g, '/'));
          }
        }
      } catch (_) {}
    }

    const SOURCE_EXTS = /\.(ts|tsx|js|jsx|sql|css|scss|json)$/i;
    const DOC_NAMES = ['README.md', 'ROADMAP.md', 'CLAUDE.md'];

    const sourceModified = [...filesWritten].some(f =>
      SOURCE_EXTS.test(f) && !DOC_NAMES.some(d => f.endsWith(d))
    );
    const docsUpdated = [...filesWritten].some(f =>
      DOC_NAMES.some(d => f.endsWith(d))
    );

    if (sourceModified && !docsUpdated) {
      process.stderr.write(
        '\nBLOCKED: Source files were modified but README.md, ROADMAP.md, ' +
        'and CLAUDE.md were not updated.\n' +
        'Update the relevant doc(s) before finishing.\n\n'
      );
      process.exit(2);
    }
  } catch (_) {}
  process.exit(0);
});
