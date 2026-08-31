import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CvEditor } from '../components/CvEditor.jsx';
import { Dropzone } from '../components/Dropzone.jsx';
import { ErrorState, Notice } from '../components/States.jsx';
import { DocumentIcon, TrashIcon } from '../components/Icons.jsx';
import { isAbort, parseCv } from '../api/client.js';
import { useCv } from '../hooks/useCv.js';
import { cvSummary, deriveCvTotals } from '../lib/cv.js';
import { formatBytes, monthsToSpan } from '../lib/format.js';

function ParseMeta({ meta }) {
  if (!meta) return null;
  const confidence = Math.round((meta.confidence || 0) * 100);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
      <span className="inline-flex items-center gap-1.5 font-medium text-ink-700">
        <DocumentIcon className="h-4 w-4 text-ink-400" />
        {meta.filename}
      </span>
      <span>{meta.fileType?.toUpperCase()}</span>
      {meta.pages ? <span>{meta.pages} pages</span> : null}
      <span>{meta.characters?.toLocaleString()} characters</span>
      <span>parser: {meta.parser}</span>
      <span title="How much of the document the parser recognised">confidence {confidence}%</span>
    </div>
  );
}

export default function CVUploadPage() {
  const { cv, meta, hasCv, savedAt, editedAt, storageAvailable, save, update, clear } = useCv();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [justParsed, setJustParsed] = useState(false);

  async function handleFile(file) {
    setUploading(true);
    setError(null);
    setJustParsed(false);
    try {
      const response = await parseCv(file);
      const parsed = response.data?.cv || {};
      const parseMeta = { ...(response.data?.meta || {}), sizeBytes: response.meta?.sizeBytes ?? file.size };
      save(deriveCvTotals(parsed), parseMeta);
      setJustParsed(true);
    } catch (err) {
      if (!isAbort(err)) setError(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-1 border-b border-ink-200 pb-4">
        <p className="eyebrow">This browser only</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Your CV</h1>
        <p className="text-sm leading-relaxed text-ink-600">
          Upload a CV once and every job in the feed gets a match score. There is no account: the parsed result is kept
          in this browser only, and the file itself is discarded as soon as it has been read.
        </p>
      </header>

      {!storageAvailable ? (
        <Notice tone="warn">
          This browser is blocking local storage, so your CV will be forgotten when you reload the page. Scoring still
          works for this session.
        </Notice>
      ) : null}

      <Dropzone onFile={handleFile} busy={uploading} />

      {error ? (
        <ErrorState
          error={error}
          title="Could not read that CV"
          onRetry={null}
        />
      ) : null}

      {hasCv ? (
        <>
          {justParsed ? (
            <Notice tone="success" onDismiss={() => setJustParsed(false)}>
              Parsed: {cvSummary(cv)}. Check the details below and fix anything the parser got wrong, then{' '}
              <Link to="/jobs" className="font-semibold underline">
                browse the feed
              </Link>{' '}
              to see your scores.
            </Notice>
          ) : null}

          {meta?.warnings?.length ? (
            <Notice tone="warn">
              <p className="font-semibold">The parser was unsure about a few things:</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {meta.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <section className="card divide-y divide-ink-200">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 space-y-1.5">
                <ParseMeta meta={meta} />
                <p className="text-xs text-ink-400">
                  {cvSummary(cv)} · {monthsToSpan(cv.totalExperienceMonths)} experience
                  {meta?.sizeBytes ? ` · ${formatBytes(meta.sizeBytes)} file` : ''}
                  {editedAt ? ' · edited by you' : savedAt ? ' · as parsed' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Remove your CV from this browser? Match scores will disappear.')) clear();
                }}
                className="btn-secondary btn-sm shrink-0 text-red-700 hover:border-red-300 hover:bg-red-50"
              >
                <TrashIcon className="h-4 w-4" />
                Clear CV
              </button>
            </div>

            <div className="p-4 sm:p-5">
              <p className="mb-4 rounded-lg bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-500">
                Everything here is editable, and your edits are what get scored. The parser works from a skills
                dictionary, so it is deliberately cautious. Expect to add a few things, especially from an unusual
                layout.
              </p>
              <CvEditor cv={cv} onChange={(patch) => update((current) => deriveCvTotals({ ...current, ...patch }))} />
            </div>
          </section>
        </>
      ) : (
        <section className="card space-y-3 p-5 text-sm leading-relaxed text-ink-600">
          <h2 className="text-base font-semibold text-ink-800">What happens to your CV</h2>
          <ol className="list-inside list-decimal space-y-1.5">
            <li>The file is uploaded to the Khoj API, which forwards it to the parsing service in memory.</li>
            <li>Text is extracted, skills and history are pulled out, and the structured result is sent back to you.</li>
            <li>Nothing is written to any database. The response even says so (<code>persisted: false</code>).</li>
            <li>Your browser keeps the result in local storage so job cards can be scored instantly.</li>
          </ol>
          <p className="text-xs text-ink-500">Clearing it here, or clearing site data, removes it completely.</p>
        </section>
      )}
    </div>
  );
}
